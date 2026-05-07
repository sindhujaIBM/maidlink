/**
 * Integration tests — Estimator flow
 *
 * Covers: photo upload URL handler, analyse handler (validation + rate-limit +
 * DB persistence), and history handler.
 *
 * Bedrock, SES, and S3 are mocked so no AWS credentials are needed.
 * DB (Docker Postgres) is real — this verifies the persistence layer end-to-end.
 *
 * Prerequisites: `npm run db:up`
 * Run with:      `npm run test:integration`
 */

import { describe, it, beforeAll, afterEach, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import { createTestPool, cleanTables, seedUser } from './helpers/db';
import { makeToken, makeEvent } from './helpers/auth';

// ── AWS / S3 mocks (hoisted before imports) ───────────────────────────────────

// vi.hoisted ensures these refs exist when the mock factories run (before imports).
const { mockBedrockSend } = vi.hoisted(() => ({ mockBedrockSend: vi.fn() }));

vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  // Both must be classes (not arrow fns) so `new Foo()` works at module init.
  BedrockRuntimeClient: class { send = mockBedrockSend; },
  InvokeModelCommand:   class { constructor(public args: unknown) {} },
}));

vi.mock('@aws-sdk/client-ses', () => ({
  SESClient:        class { send() { return Promise.resolve({}); } },
  SendEmailCommand: class { constructor(public params: unknown) {} },
}));

vi.mock('../../services/users/src/lib/s3', () => ({
  getObjectAsBase64: vi.fn().mockResolvedValue({ base64: 'dGVzdA==', mediaType: 'image/jpeg' }),
  getEstimatorPhotoUploadUrl: vi.fn().mockResolvedValue({
    uploadUrl: 'https://test-bucket.s3.amazonaws.com/estimator-photos/uid/key.jpg?X-Amz-Signature=fake',
    s3Key:     'estimator-photos/test-user/1234-abcd.jpg',
  }),
  getPhotoUrl: vi.fn().mockResolvedValue('https://test-bucket.s3.amazonaws.com/estimator-photos/uid/key.jpg?signed'),
}));

// ── Import handlers after mocks ───────────────────────────────────────────────

import { handler as photoUploadUrlHandler } from '../../services/users/src/handlers/estimatorPhotoUpload';
import { handler as analyzeHandler }        from '../../services/users/src/handlers/estimatorAnalyze';
import { handler as historyHandler }        from '../../services/users/src/handlers/estimatorHistory';

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Minimal valid Nova Lite response — matches the JSON schema the handler expects.
const MOCK_AI_RESULT = {
  overallCondition:    'average',
  matchesSelfReport:   true,
  conditionAssessment: 'Home is in average condition.',
  roomBreakdown: [
    { room: 'Kitchen',    condition: 'average', estimatedMinutes: 45, notes: 'Normal.',  priorityTasks: ['Clean stovetop'] },
    { room: 'Bathroom 1', condition: 'average', estimatedMinutes: 30, notes: 'Normal.',  priorityTasks: ['Scrub toilet'] },
    { room: 'Bedroom 1',  condition: 'average', estimatedMinutes: 30, notes: 'Normal.',  priorityTasks: ['Dust surfaces'] },
  ],
  oneCleanerHours:   3.5,
  twoCleanerHours:   2.0,
  generatedChecklist: [
    { room: 'Kitchen', tasks: [{ task: 'Clean stovetop', priority: 'standard' }] },
  ],
};

function mockBedrockResponse(result = MOCK_AI_RESULT) {
  mockBedrockSend.mockResolvedValueOnce({
    body: Buffer.from(JSON.stringify({
      output: { message: { content: [{ text: JSON.stringify(result) }] } },
    })),
  });
}

// 5 photos across 3 rooms — satisfies MIN_PHOTOS = 5 in the handler.
function validAnalyzeBody(overrides: Record<string, unknown> = {}) {
  return {
    bedrooms:    2,
    bathrooms:   1,
    sqftRange:   '1000-1499',
    condition:   'Normal',
    extras:      [],
    cleaningType: 'Standard Cleaning',
    pets:         false,
    cookingFreq:  'Occasionally',
    cookingStyle: 'Moderate',
    rooms: [
      { room: 'Kitchen',    photoS3Keys: ['estimator-photos/uid/1.jpg', 'estimator-photos/uid/2.jpg'] },
      { room: 'Bathroom 1', photoS3Keys: ['estimator-photos/uid/3.jpg'] },
      { room: 'Bedroom 1',  photoS3Keys: ['estimator-photos/uid/4.jpg', 'estimator-photos/uid/5.jpg'] },
    ],
    ...overrides,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

let pool: Pool;

beforeAll(async () => {
  pool = createTestPool();
  await pool.query('SELECT 1');
});

afterEach(async () => {
  await cleanTables(pool);
  vi.clearAllMocks();
});

// ── Photo upload URL handler ──────────────────────────────────────────────────

describe('GET /users/me/estimator-photo-upload-url', () => {
  it('returns 401 without auth token', async () => {
    const res = await photoUploadUrlHandler(makeEvent({ method: 'GET' }), {} as never);
    expect(res.statusCode).toBe(401);
  });

  it('returns a pre-signed upload URL and an estimator-photos/ S3 key', async () => {
    const user  = await seedUser(pool);
    const token = makeToken(user.id);

    const res  = await photoUploadUrlHandler(makeEvent({ method: 'GET', token }), {} as never);
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.data.uploadUrl).toMatch(/^https?:\/\//);
    expect(body.data.s3Key).toMatch(/^estimator-photos\//);
  });
});

// ── Analyse handler — input validation ───────────────────────────────────────

describe('POST /users/me/estimator/analyze — validation', () => {
  it('returns 401 without auth token', async () => {
    const res = await analyzeHandler(makeEvent({ body: validAnalyzeBody() }), {} as never);
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 with no body', async () => {
    const user  = await seedUser(pool);
    const token = makeToken(user.id);
    const res   = await analyzeHandler(makeEvent({ token }), {} as never);
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 with an empty rooms array', async () => {
    const user  = await seedUser(pool);
    const token = makeToken(user.id);
    const res   = await analyzeHandler(makeEvent({ token, body: validAnalyzeBody({ rooms: [] }) }), {} as never);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.message).toMatch(/room/i);
  });

  it('returns 400 when total photos < 5 (MIN_PHOTOS)', async () => {
    const user  = await seedUser(pool);
    const token = makeToken(user.id);
    const body  = validAnalyzeBody({
      rooms: [{ room: 'Kitchen', photoS3Keys: ['estimator-photos/uid/1.jpg', 'estimator-photos/uid/2.jpg'] }],
    });
    const res = await analyzeHandler(makeEvent({ token, body }), {} as never);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.message).toMatch(/5 photos/i);
  });

  it('returns 400 when total photos > 10 (MAX_PHOTOS)', async () => {
    const user  = await seedUser(pool);
    const token = makeToken(user.id);
    const keys  = Array.from({ length: 11 }, (_, i) => `estimator-photos/uid/${i}.jpg`);
    const body  = validAnalyzeBody({ rooms: [{ room: 'Kitchen', photoS3Keys: keys }] });
    const res   = await analyzeHandler(makeEvent({ token, body }), {} as never);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.message).toMatch(/10 photos/i);
  });

  it('returns 400 when a photo key does not start with estimator-photos/', async () => {
    const user  = await seedUser(pool);
    const token = makeToken(user.id);
    const body  = validAnalyzeBody({
      rooms: [{ room: 'Kitchen', photoS3Keys: [
        'profile-photos/uid/1.jpg',
        'estimator-photos/uid/2.jpg',
        'estimator-photos/uid/3.jpg',
        'estimator-photos/uid/4.jpg',
        'estimator-photos/uid/5.jpg',
      ]}],
    });
    const res = await analyzeHandler(makeEvent({ token, body }), {} as never);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.message).toMatch(/invalid photo key/i);
  });
});

// ── Analyse handler — rate limiting ──────────────────────────────────────────

describe('POST /users/me/estimator/analyze — rate limiting', () => {
  it('returns 403 once the daily limit of 5 analyses is reached', async () => {
    const user  = await seedUser(pool);
    const token = makeToken(user.id);

    // Seed 5 analyses directly (counts as 5 in the 24-hour window)
    for (let i = 0; i < 5; i++) {
      await pool.query(`INSERT INTO estimator_analyses (user_id) VALUES ($1)`, [user.id]);
    }

    const res = await analyzeHandler(makeEvent({ token, body: validAnalyzeBody() }), {} as never);
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error.message).toMatch(/daily limit/i);
  });

  it('does not apply one user\'s limit to another user', async () => {
    const userA = await seedUser(pool);
    const userB = await seedUser(pool);

    for (let i = 0; i < 5; i++) {
      await pool.query(`INSERT INTO estimator_analyses (user_id) VALUES ($1)`, [userA.id]);
    }

    mockBedrockResponse();

    const token = makeToken(userB.id);
    const res   = await analyzeHandler(makeEvent({ token, body: validAnalyzeBody() }), {} as never);
    expect(res.statusCode).toBe(200);
  });

  it('allows a new analysis once old ones roll past the 24-hour window', async () => {
    const user  = await seedUser(pool);
    const token = makeToken(user.id);

    // 5 analyses backdated 25 hours — outside the window
    await pool.query(
      `INSERT INTO estimator_analyses (user_id, created_at)
       SELECT $1, NOW() - INTERVAL '25 hours' FROM generate_series(1, 5)`,
      [user.id],
    );

    mockBedrockResponse();

    const res = await analyzeHandler(makeEvent({ token, body: validAnalyzeBody() }), {} as never);
    expect(res.statusCode).toBe(200);
  });
});

// ── Analyse handler — successful analysis ────────────────────────────────────

describe('POST /users/me/estimator/analyze — success', () => {
  it('returns the AI analysis result', async () => {
    const user  = await seedUser(pool);
    const token = makeToken(user.id);
    mockBedrockResponse();

    const res  = await analyzeHandler(makeEvent({ token, body: validAnalyzeBody() }), {} as never);
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.data.analysis.overallCondition).toBe('average');
    expect(body.data.analysis.oneCleanerHours).toBe(3.5);
    expect(body.data.analysis.roomBreakdown).toHaveLength(3);
  });

  it('persists the analysis to the DB so it appears in history', async () => {
    const user  = await seedUser(pool);
    const token = makeToken(user.id);
    mockBedrockResponse();

    await analyzeHandler(makeEvent({ token, body: validAnalyzeBody() }), {} as never);

    const { rows } = await pool.query(
      `SELECT result, home_details, photo_s3_keys FROM estimator_analyses WHERE user_id = $1`,
      [user.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].result.overallCondition).toBe('average');
    expect(rows[0].home_details.bedrooms).toBe(2);
    expect(rows[0].photo_s3_keys).toHaveLength(5);
  });

  it('increments the analysis count in the DB (counts toward rate limit)', async () => {
    const user  = await seedUser(pool);
    const token = makeToken(user.id);
    mockBedrockResponse();

    await analyzeHandler(makeEvent({ token, body: validAnalyzeBody() }), {} as never);

    const { rows: [{ count }] } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM estimator_analyses WHERE user_id = $1`,
      [user.id],
    );
    expect(parseInt(count, 10)).toBe(1);
  });
});

// ── History handler ───────────────────────────────────────────────────────────

describe('GET /users/me/estimator/history', () => {
  it('returns 401 without auth token', async () => {
    const res = await historyHandler(makeEvent({ method: 'GET' }), {} as never);
    expect(res.statusCode).toBe(401);
  });

  it('returns an empty list when no analyses exist', async () => {
    const user  = await seedUser(pool);
    const token = makeToken(user.id);

    const res  = await historyHandler(makeEvent({ method: 'GET', token }), {} as never);
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.data.items).toEqual([]);
  });

  it('returns only completed analyses (rows without a result are excluded)', async () => {
    const user  = await seedUser(pool);
    const token = makeToken(user.id);

    // Incomplete row (result IS NULL — e.g. Bedrock failed mid-flight)
    await pool.query(`INSERT INTO estimator_analyses (user_id) VALUES ($1)`, [user.id]);

    const res  = await historyHandler(makeEvent({ method: 'GET', token }), {} as never);
    const body = JSON.parse(res.body);

    expect(body.data.items).toHaveLength(0);
  });

  it('returns completed analyses with result, homeDetails, and photoUrls', async () => {
    const user  = await seedUser(pool);
    const token = makeToken(user.id);
    mockBedrockResponse();

    // Create a completed analysis via the analyse handler
    await analyzeHandler(makeEvent({ token, body: validAnalyzeBody() }), {} as never);

    const res  = await historyHandler(makeEvent({ method: 'GET', token }), {} as never);
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.data.items).toHaveLength(1);
    const item = body.data.items[0];
    expect(item.result.overallCondition).toBe('average');
    expect(item.homeDetails.bedrooms).toBe(2);
    expect(item.photoUrls).toHaveLength(5);
    expect(item.id).toBeTruthy();
    expect(item.createdAt).toBeTruthy();
  });

  it('does not return another user\'s analyses', async () => {
    const userA = await seedUser(pool);
    const userB = await seedUser(pool);
    mockBedrockResponse();

    // userA runs an analysis
    await analyzeHandler(makeEvent({ token: makeToken(userA.id), body: validAnalyzeBody() }), {} as never);

    // userB's history should be empty
    const res  = await historyHandler(makeEvent({ method: 'GET', token: makeToken(userB.id) }), {} as never);
    const body = JSON.parse(res.body);
    expect(body.data.items).toHaveLength(0);
  });
});
