/**
 * POST /users/me/estimator/analyze
 *
 * Accepts form inputs + S3 keys of uploaded room photos.
 * Fetches the photos from S3, sends them to Amazon Nova Lite via Bedrock
 * (falls back to Claude 3.5 Haiku if Nova Lite fails), and returns an
 * AI-generated condition assessment + refined time estimate.
 *
 * Rate-limited to 5 analyses per user per 24 hours.
 */

import type { APIGatewayProxyEvent } from 'aws-lambda';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { withAuth, ok, ValidationError, ForbiddenError, getPool } from '@maidlink/shared';
import { getObjectAsBase64 } from '../lib/s3';

const DAILY_LIMIT = 5;

// Bedrock is called in us-west-2 — Nova Lite & Claude 3.5 Haiku available there via inference profiles
const bedrock = new BedrockRuntimeClient({ region: 'us-west-2' });

const NOVA_LITE_MODEL = 'us.amazon.nova-lite-v1:0';
const HAIKU_MODEL     = 'us.anthropic.claude-3-5-haiku-20241022-v1:0';

interface AnalyzeBody {
  bedrooms:      number;
  bathrooms:     number;
  sqftRange:     string;
  condition:     string;
  extras:        string[];
  photoS3Keys:   string[];
  cleaningType?: string;
  pets?:         boolean;
  cookingFreq?:  string;
  cookingStyle?: string;
}

// ── Prompt ────────────────────────────────────────────────────────────────────

function buildPrompt(body: AnalyzeBody): string {
  const extrasText = body.extras.length > 0 ? body.extras.join(', ') : 'none';
  const petsText   = body.pets ? 'Yes — account for pet hair and dander' : 'No';

  return `You are an expert residential cleaning estimator for a professional cleaning company in Calgary, Canada.

The customer has described their home:
- Bedrooms: ${body.bedrooms}
- Bathrooms: ${body.bathrooms}
- Size: ${body.sqftRange} sq ft
- Cleaning type requested: ${body.cleaningType ?? 'Standard Cleaning'}
- Self-reported condition: ${body.condition}
- Pets: ${petsText}
- Cooking frequency: ${body.cookingFreq ?? 'Occasionally'}
- Cooking style: ${body.cookingStyle ?? 'Moderate'}
- Requested add-ons: ${extrasText}

They have uploaded ${body.photoS3Keys.length} photo(s) of their space.

Please analyse the photos and provide:
1. CONDITION ASSESSMENT: What you observe in the photos (clutter level, dust, stains, grease, specific areas needing extra attention). Be specific and helpful.
2. ADJUSTED CONDITION: Based on the photos, classify actual condition as "pristine", "average", "messy", or "very_messy". State if it matches the customer's self-report.
3. CLEANING TYPE CHECK: Does the requested cleaning type (${body.cleaningType ?? 'Standard Cleaning'}) match what the photos show? Flag if a deeper clean is warranted.
4. TIME ESTIMATE: Based on ALL inputs AND the photos, provide:
   - Estimated hours for 1 cleaner
   - Estimated hours for 2 cleaners
   Round to nearest 0.5 hours. Account for cleaning type multipliers (Deep ×1.5, Move-Out ×2), condition, pets, cooking habits, and add-ons.
5. KEY AREAS: List 2–4 specific areas or tasks that will take the most time based on what you see.

Be concise, professional, and encouraging. Respond ONLY with JSON using these exact keys:
{
  "conditionAssessment": "...",
  "adjustedCondition": "pristine|average|messy|very_messy",
  "matchesSelfReport": true|false,
  "cleaningTypeNote": "...",
  "oneCleanerHours": 3.5,
  "twoCleanerHours": 2.0,
  "keyAreas": ["...", "...", "..."],
  "confidenceNote": "..."
}`;
}

// ── Nova Lite invocation ──────────────────────────────────────────────────────

async function invokeNovaLite(
  prompt: string,
  images: Array<{ base64: string; mediaType: string }>,
): Promise<string> {
  const content: unknown[] = images.map(img => ({
    image: {
      format: img.mediaType.split('/')[1] || 'jpeg',
      source: { bytes: img.base64 },
    },
  }));
  content.push({ text: prompt });

  const payload = {
    messages: [{ role: 'user', content }],
    inferenceConfig: { max_new_tokens: 800, temperature: 0.2 },
  };

  const res = await bedrock.send(new InvokeModelCommand({
    modelId:     NOVA_LITE_MODEL,
    contentType: 'application/json',
    accept:      'application/json',
    body:        Buffer.from(JSON.stringify(payload)),
  }));

  const decoded = JSON.parse(Buffer.from(res.body).toString());
  return decoded.output?.message?.content?.[0]?.text ?? '';
}

// ── Claude 3.5 Haiku fallback ─────────────────────────────────────────────────

async function invokeHaiku(
  prompt: string,
  images: Array<{ base64: string; mediaType: string }>,
): Promise<string> {
  const content: unknown[] = images.map(img => ({
    type:   'image',
    source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
  }));
  content.push({ type: 'text', text: prompt });

  const payload = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens:        800,
    temperature:       0.2,
    messages: [{ role: 'user', content }],
  };

  const res = await bedrock.send(new InvokeModelCommand({
    modelId:     HAIKU_MODEL,
    contentType: 'application/json',
    accept:      'application/json',
    body:        Buffer.from(JSON.stringify(payload)),
  }));

  const decoded = JSON.parse(Buffer.from(res.body).toString());
  return decoded.content?.[0]?.text ?? '';
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = withAuth(async (event: APIGatewayProxyEvent, auth) => {
  if (!event.body) throw new ValidationError('Request body is required');

  const body = JSON.parse(event.body) as AnalyzeBody;
  const { photoS3Keys } = body;

  if (!photoS3Keys || photoS3Keys.length === 0) {
    throw new ValidationError('At least one photo is required');
  }
  if (photoS3Keys.length > 5) {
    throw new ValidationError('Maximum 5 photos allowed');
  }
  for (const key of photoS3Keys) {
    if (!key.startsWith('estimator-photos/')) {
      throw new ValidationError('Invalid photo key');
    }
  }

  // ── Rate limit: 5 analyses per user per 24 hours ──────────────────────────
  const pool = getPool();
  const { rows: [{ count }] } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM estimator_analyses
     WHERE user_id = $1
       AND created_at > NOW() - INTERVAL '24 hours'`,
    [auth.userId]
  );
  if (parseInt(count, 10) >= DAILY_LIMIT) {
    throw new ForbiddenError(`Daily limit of ${DAILY_LIMIT} AI analyses reached. Try again tomorrow.`);
  }

  // Log before calling Bedrock (counts even on failure to prevent abuse via rapid retries)
  await pool.query(
    `INSERT INTO estimator_analyses (user_id) VALUES ($1)`,
    [auth.userId]
  );

  // ── Fetch photos from S3 ──────────────────────────────────────────────────
  const images = await Promise.all(photoS3Keys.map(k => getObjectAsBase64(k)));

  const prompt = buildPrompt(body);

  // Try Nova Lite first, fall back to Claude 3.5 Haiku
  let rawText: string;
  try {
    rawText = await invokeNovaLite(prompt, images);
  } catch (novaErr) {
    console.warn('Nova Lite failed, falling back to Claude 3.5 Haiku:', novaErr);
    rawText = await invokeHaiku(prompt, images);
  }

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Model returned unexpected format');
  const result = JSON.parse(jsonMatch[0]);

  return ok({ analysis: result });
});
