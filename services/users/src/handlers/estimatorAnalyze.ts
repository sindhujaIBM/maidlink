/**
 * POST /users/me/estimator/analyze
 *
 * Accepts home details + per-room S3 photo keys.
 * Fetches photos from S3, sends them to Amazon Nova Lite via Bedrock
 * with room-labelled context, and returns:
 *   - Per-room condition assessment + time estimate
 *   - Overall 1-cleaner / 2-cleaner hour estimate
 *   - AI-generated cleaning checklist customised to what was seen in photos
 *
 * Rate-limited to 5 analyses per user per 24 hours.
 */

import type { APIGatewayProxyEvent } from 'aws-lambda';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { withAuth, ok, ValidationError, ForbiddenError, getPool } from '@maidlink/shared';
import { getObjectAsBase64 } from '../lib/s3';

const ses = new SESClient({ region: 'us-east-1' });

const DAILY_LIMIT     = 5;
const MIN_PHOTOS      = 5;
const MAX_PHOTOS      = 10;
const bedrock         = new BedrockRuntimeClient({ region: 'us-west-2' });
const NOVA_LITE_MODEL = 'us.amazon.nova-lite-v1:0';

interface RoomInput {
  room:         string;
  photoS3Keys:  string[];
}

interface AnalyzeBody {
  bedrooms:      number;
  bathrooms:     number;
  sqftRange:     string;
  condition:     string;
  extras:        string[];
  cleaningType?: string;
  pets?:         boolean;
  cookingFreq?:  string;
  cookingStyle?: string;
  rooms:         RoomInput[];
}

// ── Prompts ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert residential cleaning estimator for a professional cleaning company in Calgary, Canada.

CONDITION CLASSIFICATION:
- pristine: spotless, no visible dirt or clutter
- average: normal lived-in state, light dust and minor clutter
- messy: visible grime, clutter, or buildup requiring extra effort
- very_messy: heavy soiling, significant buildup, or major clutter

TIME MULTIPLIERS:
- Deep Cleaning: ×1.5 | Move-Out/Move-In: ×2
- Condition: messy ×1.25, very_messy ×1.5
- Pets: +30 min | Cooking frequently: +60 min | Heavy cooking style: +60 min
- Add-ons: oven +60min, fridge +30min, windows +60min, basement +60min, laundry +30min, garage +45min
Round final total to nearest 0.5h.

CHECKLIST SCOPE BY CLEANING TYPE:
- Standard: maintenance tasks only (surfaces, floors, fixtures)
- Deep: all Standard tasks + buildup removal, scrubbing, baseboards, ceiling fans
- Move-Out/Move-In: all Deep tasks + inside cabinets, inside appliances, full reset

STANDARD TASKS BY ROOM (select only what is relevant to what you see):
Kitchen: clean countertops, clean stovetop and burners, degrease range hood/filter [Deep/MoveOut], clean oven exterior, clean oven interior [Deep/MoveOut], clean microwave inside and out, wipe fridge exterior, clean fridge interior [Deep/MoveOut], wipe cabinet fronts, clean sink and faucet, wipe backsplash, wipe small appliances, sweep and mop floor
Bathroom: scrub toilet, scrub shower/tub, remove soap scum [Deep/MoveOut], clean glass shower door, scrub tile grout [Deep/MoveOut], clean sink and faucet, wipe vanity, clean mirrors, wipe cabinet fronts, clean exhaust fan cover [Deep/MoveOut], sweep and mop floor
Bedroom: dust all surfaces, wipe furniture exteriors, vacuum floor, vacuum under bed [Deep/MoveOut], wipe windowsills, wipe light switches and door handles, dust ceiling fan [Deep/MoveOut], clean mirrors
Living Room: dust all surfaces, vacuum upholstered furniture, dust blinds [Deep/MoveOut], vacuum floor, vacuum under furniture [Deep/MoveOut], dust ceiling fan [Deep/MoveOut], wipe light switches, clean TV screen, clean mirrors
Basement: sweep and vacuum floors, mop floors, dust surfaces and shelves, remove cobwebs, clean utility sink [Deep/MoveOut]
Garage: sweep floor, remove cobwebs, wipe counters and workbench
Throughout: remove cobwebs, dust baseboards [Deep/MoveOut], wipe light switches and outlets, wipe door handles, clean interior windows [Deep/MoveOut], empty all trash bins

PHOTO COVERAGE: if fewer than 3 distinct angles are visible for a room, add a coverageWarnings entry naming the missing areas specifically (e.g. "opposite wall", "floor and lower cabinets").

UPGRADE RECOMMENDATION RULES:
- Only recommend an upgrade if there is clear visual evidence (e.g. heavy grease, soap scum buildup, significant grime)
- Recommend the minimum necessary upgrade: Standard → Deep, or Deep → Move-Out/Move-In
- Never recommend a downgrade
- benefits[] must list specific tasks the upgraded service adds that are relevant to what you observed (3-5 items)
- Omit upgradeRecommendation entirely if the requested cleaning type is appropriate
- VACANCY DETECTION: If the requested service is Standard Cleaning or Deep Cleaning, but the majority of rooms appear vacant (no furniture, bare floors, empty walls, no personal belongings visible), recommend upgrading to Move-Out/Move-In Cleaning. Set reason to explain that vacant properties require a full interior reset (inside cabinets, inside appliances, baseboards, all hidden surfaces) to reach a move-in ready standard. Set suggestedType to "Move-Out/Move-In Cleaning".
- FURNISHED MISMATCH: If the requested service is Move-Out/Move-In Cleaning but rooms appear furnished or occupied (furniture present, personal belongings visible), do NOT recommend a downgrade. Instead, note in conditionAssessment that Move-Out/Move-In cleaning is designed for vacant properties and set confidenceNote to: "Rooms appear furnished — Move-Out/Move-In cleaning applies to fully vacant properties. Please confirm all furniture and belongings will be removed before the cleaning date."

OUTPUT: respond ONLY with valid JSON, no markdown fences:
{
  "overallCondition": "pristine|average|messy|very_messy",
  "matchesSelfReport": true,
  "conditionAssessment": "2-3 sentence overall summary of what was observed across all rooms",
  "roomBreakdown": [
    {
      "room": "Kitchen",
      "condition": "messy",
      "estimatedMinutes": 75,
      "notes": "Specific observations for this room",
      "priorityTasks": ["task 1", "task 2"]
    }
  ],
  "oneCleanerHours": 4.5,
  "twoCleanerHours": 2.5,
  "upgradeRecommendation": {
    "suggestedType": "Deep Cleaning",
    "reason": "Heavy grease buildup visible on stovetop and oven exterior indicates significant interior soiling that Standard Cleaning does not cover.",
    "benefits": ["Inside oven cleaning", "Scrub backsplash and grout", "Detail clean sink and drain", "Remove grease from range hood"]
  },
  "generatedChecklist": [
    {
      "room": "Kitchen",
      "tasks": [
        { "task": "Degrease stovetop and burners", "priority": "high", "aiNote": "Heavy grease residue visible on burners" },
        { "task": "Clean countertops", "priority": "medium" },
        { "task": "Sweep and mop floor", "priority": "high" }
      ]
    }
  ],
  "coverageWarnings": [
    { "room": "Kitchen", "missing": "opposite wall and floor not visible — estimate may be less accurate" }
  ],
  "confidenceNote": "Optional: note about overall photo quality"
}`;

function buildUserPrompt(body: AnalyzeBody): string {
  const extrasText  = body.extras.length > 0 ? body.extras.join(', ') : 'none';
  const petsText    = body.pets ? 'Yes — account for pet hair and dander' : 'No';
  const roomList    = body.rooms
    .map(r => `${r.room} (${r.photoS3Keys.length} photo${r.photoS3Keys.length > 1 ? 's' : ''})`)
    .join(', ');
  const cleaningType = body.cleaningType ?? 'Standard Cleaning';
  const isMoveClean  = cleaningType.toLowerCase().includes('move');
  const vacancyNote  = isMoveClean
    ? '\n⚠ Vacancy cleaning: the home is expected to be fully empty — no furniture or personal belongings — on the day of service. If rooms appear furnished or occupied, flag this in conditionAssessment and confidenceNote.'
    : '';

  return `Customer's home details:
- Bedrooms: ${body.bedrooms}
- Bathrooms: ${body.bathrooms}
- Size: ${body.sqftRange} sq ft
- Cleaning type requested: ${cleaningType}${vacancyNote}
- Self-reported condition: ${body.condition}
- Pets: ${petsText}
- Cooking frequency: ${body.cookingFreq ?? 'Occasionally'}, style: ${body.cookingStyle ?? 'Moderate'}
- Requested add-ons: ${extrasText}

Photos are provided above, labelled by room: ${roomList}

Instructions:
1. Analyse each room's photos for: clutter level, dust, grease, stains, soap scum, pet hair, floor condition, and any specific areas needing extra attention.
2. For each room: assign a condition, estimate cleaning time in minutes, and list the 2-3 most important tasks.
3. Build a customised cleaning checklist per room. Include only tasks relevant to what you see. Add a brief aiNote on HIGH priority tasks explaining what you observed.
4. Apply all multipliers and additions to calculate oneCleanerHours and twoCleanerHours.
5. If visible evidence warrants an upgrade, populate upgradeRecommendation with the suggested type, a specific reason tied to what you observed, and 3-5 concrete benefits the upgraded service adds.
6. Assess photo coverage and populate coverageWarnings for any room with fewer than 3 distinct angles.`;
}

// ── Nova Lite invocation with room-labelled images ────────────────────────────

async function invokeNovaLite(
  userPrompt: string,
  roomImages: Array<{ room: string; images: Array<{ base64: string; mediaType: string }> }>,
): Promise<string> {
  const content: unknown[] = [];

  // Interleave room labels with their photos so the AI knows which room each image belongs to
  for (const { room, images } of roomImages) {
    content.push({ text: `--- ${room} ---` });
    for (const img of images) {
      content.push({
        image: {
          format: img.mediaType.replace('image/', '') || 'jpeg',
          source: { bytes: img.base64 },
        },
      });
    }
  }

  content.push({ text: userPrompt });

  const payload = {
    system: [{ text: SYSTEM_PROMPT }],
    messages: [{ role: 'user', content }],
    inferenceConfig: { max_new_tokens: 2000, temperature: 0.2 },
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

// ── Notification email ────────────────────────────────────────────────────────

function buildNotificationEmail(
  userName: string,
  userEmail: string,
  body: AnalyzeBody,
  result: Record<string, unknown>,
): string {
  const hd = body;
  const r  = result as {
    overallCondition: string;
    oneCleanerHours:  number;
    twoCleanerHours:  number;
    conditionAssessment: string;
    roomBreakdown: Array<{ room: string; condition: string; estimatedMinutes: number }>;
    upgradeRecommendation?: { suggestedType: string; reason: string; benefits: string[] };
  };

  const extras    = hd.extras.length > 0 ? hd.extras.join(', ') : 'None';
  const totalMin  = r.roomBreakdown.reduce((s, rb) => s + rb.estimatedMinutes, 0);
  const totalHrs  = (totalMin / 60).toFixed(1);

  const roomLines = r.roomBreakdown
    .map(rb => `  • ${rb.room}: ${rb.estimatedMinutes} min (${rb.condition.replace('_', ' ')})`)
    .join('\n');

  const upgradeLine = r.upgradeRecommendation
    ? `\nUPGRADE RECOMMENDATION\nSuggested: ${r.upgradeRecommendation.suggestedType}\nReason: ${r.upgradeRecommendation.reason}\nBenefits: ${r.upgradeRecommendation.benefits.join(', ')}\n`
    : '';

  return `New estimator analysis completed.

USER
  Name:   ${userName}
  Email:  ${userEmail}

HOME DETAILS
  Bedrooms:    ${hd.bedrooms}
  Bathrooms:   ${hd.bathrooms}
  Size:        ${hd.sqftRange} sqft
  Type:        ${hd.cleaningType ?? 'Standard Cleaning'}
  Condition:   ${hd.condition}
  Pets:        ${hd.pets ? 'Yes' : 'No'}
  Cooking:     ${hd.cookingFreq ?? 'Occasionally'}, ${hd.cookingStyle ?? 'Moderate'}
  Extras:      ${extras}

AI RESULT
  Overall condition: ${r.overallCondition.replace('_', ' ')}
  Assessment: ${r.conditionAssessment}

ROOM BREAKDOWN (base time)
${roomLines}
  Total base: ${totalHrs} hrs

ESTIMATE
  1 cleaner: ${r.oneCleanerHours} hrs
  2 cleaners: ${r.twoCleanerHours} hrs
${upgradeLine}
View full details in the Admin Estimator page: https://maidlink.ca/admin/estimator
`;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = withAuth(async (event: APIGatewayProxyEvent, auth) => {
  if (!event.body) throw new ValidationError('Request body is required');

  const body = JSON.parse(event.body) as AnalyzeBody;
  const { rooms } = body;

  if (!Array.isArray(rooms) || rooms.length === 0) {
    throw new ValidationError('At least one room with photos is required');
  }

  const allKeys    = rooms.flatMap(r => r.photoS3Keys);
  const totalPhotos = allKeys.length;

  if (totalPhotos < MIN_PHOTOS) throw new ValidationError(`At least ${MIN_PHOTOS} photos are required`);
  if (totalPhotos > MAX_PHOTOS) throw new ValidationError(`Maximum ${MAX_PHOTOS} photos allowed`);

  for (const key of allKeys) {
    if (!key.startsWith('estimator-photos/')) throw new ValidationError('Invalid photo key');
  }

  // ── Rate limit: 5 analyses per user per 24 hours ──────────────────────────
  const pool = getPool();
  const { rows: [{ count }] } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM estimator_analyses
     WHERE user_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
    [auth.userId]
  );
  if (parseInt(count, 10) >= DAILY_LIMIT) {
    throw new ForbiddenError(`Daily limit of ${DAILY_LIMIT} AI analyses reached. Try again tomorrow.`);
  }

  // Log before calling Bedrock (counts even on failure to prevent rapid-retry abuse)
  const { rows: [{ id: analysisId }] } = await pool.query<{ id: string }>(
    `INSERT INTO estimator_analyses (user_id) VALUES ($1) RETURNING id`,
    [auth.userId]
  );

  // ── Fetch photos from S3, organised by room ───────────────────────────────
  const roomImages = await Promise.all(
    rooms
      .filter(r => r.photoS3Keys.length > 0)
      .map(async r => ({
        room:   r.room,
        images: await Promise.all(r.photoS3Keys.map(k => getObjectAsBase64(k))),
      }))
  );

  const prompt  = buildUserPrompt(body);
  const rawText = await invokeNovaLite(prompt, roomImages);

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Model returned unexpected format');
  const result = JSON.parse(jsonMatch[0]);

  // Persist result so the user can review estimates historically
  const homeDetails = {
    bedrooms:     body.bedrooms,
    bathrooms:    body.bathrooms,
    sqftRange:    body.sqftRange,
    condition:    body.condition,
    extras:       body.extras,
    cleaningType: body.cleaningType,
    pets:         body.pets,
    cookingFreq:  body.cookingFreq,
    cookingStyle: body.cookingStyle,
    rooms:        body.rooms.map(r => ({ room: r.room, photoCount: r.photoS3Keys.length })),
  };
  await pool.query(
    `UPDATE estimator_analyses
     SET home_details = $1, photo_s3_keys = $2, result = $3
     WHERE id = $4`,
    [homeDetails, allKeys, result, analysisId]
  );

  // ── Notify muni — fire and forget, never block the response ──────────────
  const { rows: [user] } = await pool.query<{ full_name: string }>(
    `SELECT full_name FROM users WHERE id = $1`,
    [auth.userId]
  );
  ses.send(new SendEmailCommand({
    Source:      'noreply@maidlink.ca',
    Destination: { ToAddresses: ['muni@maidlink.ca'] },
    ...(process.env.SES_CONFIG_SET ? { ConfigurationSetName: process.env.SES_CONFIG_SET } : {}),
    Message: {
      Subject: { Data: `New Estimate — ${user?.full_name ?? auth.email} (${body.bedrooms}bd/${body.bathrooms}ba, ${body.cleaningType ?? 'Standard'})` },
      Body:    { Text: { Data: buildNotificationEmail(user?.full_name ?? auth.email, auth.email, body, result) } },
    },
  })).catch(err => console.error('Estimator notify email failed:', err));

  return ok({ analysis: result });
});
