/**
 * POST /users/me/estimator/analyze
 *
 * Accepts form inputs + S3 keys of uploaded room photos.
 * Fetches the photos from S3, sends them to Amazon Nova Lite via Bedrock
 * (falls back to Claude 3.5 Haiku if Nova Lite fails), and returns an
 * AI-generated condition assessment + refined time estimate.
 */

import type { APIGatewayProxyEvent } from 'aws-lambda';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { withAuth, ok, ValidationError } from '@maidlink/shared';
import { getObjectAsBase64 } from '../lib/s3';

// Bedrock is called in us-west-2 — Nova Lite & Claude 3.5 Haiku confirmed available there
const bedrock = new BedrockRuntimeClient({ region: 'us-west-2' });

const NOVA_LITE_MODEL   = 'amazon.nova-lite-v1:0';
const HAIKU_MODEL       = 'anthropic.claude-3-5-haiku-20241022-v1:0';

interface AnalyzeBody {
  bedrooms:   number;
  bathrooms:  number;
  sqftRange:  string;
  condition:  string;
  extras:     string[];
  photoS3Keys: string[];
}

// ── Prompt ────────────────────────────────────────────────────────────────────

function buildPrompt(body: AnalyzeBody): string {
  return `You are an expert residential cleaning estimator for a professional cleaning company in Calgary, Canada.

The customer has described their home:
- Bedrooms: ${body.bedrooms}
- Bathrooms: ${body.bathrooms}
- Size: ${body.sqftRange} sq ft
- Self-reported condition: ${body.condition}
- Requested add-ons: ${body.extras.length > 0 ? body.extras.join(', ') : 'none'}

They have uploaded ${body.photoS3Keys.length} photo(s) of their space.

Please analyse the photos and provide:
1. CONDITION ASSESSMENT: What you observe in the photos (clutter level, dust, stains, specific areas that need extra attention). Be specific and helpful.
2. ADJUSTED CONDITION: Based on the photos, would you classify the actual condition as "pristine", "average", "messy", or "very messy"? State if it matches the customer's self-report.
3. TIME ESTIMATE: Based on both the form inputs AND the photos, provide:
   - Estimated hours for 1 cleaner
   - Estimated hours for 2 cleaners
   Round to nearest 0.5 hours.
4. KEY AREAS: List 2–3 specific areas or tasks that will take the most time based on what you see.

Be concise, professional, and encouraging. Format your response as JSON with these exact keys:
{
  "conditionAssessment": "...",
  "adjustedCondition": "pristine|average|messy|very_messy",
  "matchesSelfReport": true|false,
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
    inferenceConfig: { max_new_tokens: 600, temperature: 0.2 },
  };

  const res = await bedrock.send(new InvokeModelCommand({
    modelId:     NOVA_LITE_MODEL,
    contentType: 'application/json',
    accept:      'application/json',
    body:        Buffer.from(JSON.stringify(payload)),
  }));

  const decoded = JSON.parse(Buffer.from(res.body).toString());
  // Nova Lite response: output.message.content[0].text
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
    max_tokens:        600,
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
  // Claude response: content[0].text
  return decoded.content?.[0]?.text ?? '';
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = withAuth(async (event: APIGatewayProxyEvent) => {
  if (!event.body) throw new ValidationError('Request body is required');

  const body = JSON.parse(event.body) as AnalyzeBody;
  const { photoS3Keys } = body;

  if (!photoS3Keys || photoS3Keys.length === 0) {
    throw new ValidationError('At least one photo is required');
  }
  if (photoS3Keys.length > 5) {
    throw new ValidationError('Maximum 5 photos allowed');
  }
  // Validate keys are scoped to estimator-photos/ to prevent reading arbitrary objects
  for (const key of photoS3Keys) {
    if (!key.startsWith('estimator-photos/')) {
      throw new ValidationError('Invalid photo key');
    }
  }

  // Fetch all photos from S3 in parallel
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

  // Parse JSON from model response (strip markdown fences if present)
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Model returned unexpected format');
  const result = JSON.parse(jsonMatch[0]);

  return ok({ analysis: result });
});
