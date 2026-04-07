/**
 * Integration tests — Estimator rate-limit logic
 *
 * We test the DB query that estimatorAnalyze.ts uses to enforce the
 * 5-analyses-per-user-per-24h limit — without calling Bedrock or S3.
 *
 * Requires Docker Postgres running:  npm run db:up
 * Run with:  npm run test:integration
 */

import { describe, it, beforeAll, afterEach, expect } from 'vitest';
import type { Pool } from 'pg';
import { createTestPool, cleanTables, seedUser } from './helpers/db';

const DAILY_LIMIT = 5; // must match estimatorAnalyze.ts DAILY_LIMIT

let pool: Pool;

beforeAll(async () => {
  pool = createTestPool();
  await pool.query('SELECT 1'); // fail fast if Docker is not running
});

afterEach(async () => {
  await cleanTables(pool);
});

// ── Shared query — mirrors the handler's rate-limit check exactly ─────────────

async function countRecentAnalyses(userId: string): Promise<number> {
  const { rows: [{ count }] } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM estimator_analyses
     WHERE user_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
    [userId],
  );
  return parseInt(count, 10);
}

async function insertAnalysis(userId: string, backdateHours = 0): Promise<void> {
  if (backdateHours > 0) {
    await pool.query(
      `INSERT INTO estimator_analyses (user_id, created_at)
       VALUES ($1, NOW() - ($2 || ' hours')::INTERVAL)`,
      [userId, backdateHours],
    );
  } else {
    await pool.query(
      `INSERT INTO estimator_analyses (user_id) VALUES ($1)`,
      [userId],
    );
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('estimator daily rate limit', () => {
  it(`counts up to ${DAILY_LIMIT} recent analyses correctly`, async () => {
    const user = await seedUser(pool);

    for (let i = 0; i < DAILY_LIMIT; i++) {
      await insertAnalysis(user.id);
    }

    expect(await countRecentAnalyses(user.id)).toBe(DAILY_LIMIT);
  });

  it(`blocks on the ${DAILY_LIMIT + 1}th request (simulates handler check)`, async () => {
    const user = await seedUser(pool);

    for (let i = 0; i < DAILY_LIMIT; i++) {
      await insertAnalysis(user.id);
    }

    // The handler checks: if count >= DAILY_LIMIT → throw ForbiddenError
    const count   = await countRecentAnalyses(user.id);
    const blocked = count >= DAILY_LIMIT;
    expect(blocked).toBe(true);
  });

  it('does not count analyses older than 24 hours', async () => {
    const user = await seedUser(pool);

    // Insert DAILY_LIMIT rows backdated by 25 hours
    for (let i = 0; i < DAILY_LIMIT; i++) {
      await insertAnalysis(user.id, 25);
    }

    expect(await countRecentAnalyses(user.id)).toBe(0);
  });

  it('counts analyses from exactly 23 hours ago (within window)', async () => {
    const user = await seedUser(pool);

    await insertAnalysis(user.id, 23);

    expect(await countRecentAnalyses(user.id)).toBe(1);
  });

  it('does not apply one user\'s limit to another user', async () => {
    const userA = await seedUser(pool);
    const userB = await seedUser(pool);

    for (let i = 0; i < DAILY_LIMIT; i++) {
      await insertAnalysis(userA.id);
    }

    // userB starts fresh — unaffected by userA's usage
    expect(await countRecentAnalyses(userB.id)).toBe(0);
    const blockedB = (await countRecentAnalyses(userB.id)) >= DAILY_LIMIT;
    expect(blockedB).toBe(false);
  });

  it('allows a new analysis once old ones roll out of the 24-hour window', async () => {
    const user = await seedUser(pool);

    // DAILY_LIMIT rows at 25 hours ago + 1 row now
    for (let i = 0; i < DAILY_LIMIT; i++) {
      await insertAnalysis(user.id, 25);
    }
    await insertAnalysis(user.id); // one fresh analysis

    // Only the fresh one counts — still under the limit
    const count = await countRecentAnalyses(user.id);
    expect(count).toBe(1);
    expect(count >= DAILY_LIMIT).toBe(false);
  });
});
