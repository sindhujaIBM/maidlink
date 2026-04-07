/**
 * Integration tests — Booking service
 *
 * Requires Docker Postgres running:  npm run db:up
 * Run with:  npm run test:integration
 *
 * What we cover:
 *   1. Sequential double-booking → 409 via handler
 *   2. Adjacent (non-overlapping) slot → 201
 *   3. Cancel frees the slot → second booking succeeds
 *   4. DB-level EXCLUDE constraint (23P01) fires on raw concurrent INSERT
 */

import { describe, it, beforeAll, afterEach, expect } from 'vitest';
import type { Pool } from 'pg';
import { createTestPool, createTestClient, cleanTables, seedUser, seedMaid, seedAvailability } from './helpers/db';
import { makeToken, makeEvent } from './helpers/auth';
import {
  createHandler,
  cancelHandler,
} from '../../services/booking/src/handlers/booking';

// Pool used only for cleanup (single TRUNCATE query, no multi-connection issue).
let pool: Pool;

beforeAll(async () => {
  pool = createTestPool();
  // Fail fast if Docker DB is not running
  await pool.query('SELECT 1');
});

afterEach(async () => {
  await cleanTables(pool);
});

// ── Date helpers ──────────────────────────────────────────────────────────────

/**
 * Returns the next Monday at UTC 14:00 (always in the future).
 * We use a fixed day so the seeded MON availability window covers it.
 */
function nextMonday(): Date {
  const d = new Date();
  d.setUTCHours(14, 0, 0, 0);
  const day = d.getUTCDay(); // 0=Sun … 6=Sat
  const daysUntil = day === 1 ? 7 : (8 - day) % 7;
  d.setUTCDate(d.getUTCDate() + daysUntil);
  return d;
}

function addHours(d: Date, h: number): Date {
  return new Date(d.getTime() + h * 3_600_000);
}

// ── Seed helper ───────────────────────────────────────────────────────────────

async function setup() {
  const monday = nextMonday();
  const DOW_MAP = ['SUN','MON','TUE','WED','THU','FRI','SAT'] as const;
  const dayOfWeek = DOW_MAP[monday.getUTCDay()];

  // Use a single Client (not pool) so all inserts share one connection and
  // are guaranteed visible to each other without multi-connection race conditions.
  const client = await createTestClient();
  try {
    const customerUser = await seedUser(client, { fullName: 'Customer A' });
    const maidUser     = await seedUser(client, { fullName: 'Maid B' });
    const maid         = await seedMaid(client, maidUser.id);
    await seedAvailability(client, maid.id, { dayOfWeek, startTime: '08:00', endTime: '20:00' });
    return { customerUser, maidUser, maid, monday };
  } finally {
    await client.end();
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('double-booking prevention', () => {
  it('rejects a second booking for the same maid in the same slot (409)', async () => {
    const { customerUser, maid, monday } = await setup();
    const token = makeToken(customerUser.id, { roles: ['CUSTOMER'] });

    const body = {
      maidId:       maid.id,
      startAt:      monday.toISOString(),
      endAt:        addHours(monday, 3).toISOString(),
      addressLine1: '123 Test St',
      postalCode:   'T2N 1N4',
    };

    const res1 = await createHandler(makeEvent({ token, body }));
    expect(res1.statusCode).toBe(201);

    // A different customer tries the same slot
    const customer2 = await seedUser(pool, { fullName: 'Customer C' });
    const token2 = makeToken(customer2.id, { roles: ['CUSTOMER'] });
    const res2 = await createHandler(makeEvent({ token: token2, body }));
    expect(res2.statusCode).toBe(409);
  });

  it('rejects a partial overlap (booking that starts inside an existing slot)', async () => {
    const { customerUser, maid, monday } = await setup();
    const token = makeToken(customerUser.id, { roles: ['CUSTOMER'] });

    // First booking: 14:00–17:00
    await createHandler(makeEvent({
      token,
      body: {
        maidId: maid.id,
        startAt: monday.toISOString(),
        endAt:   addHours(monday, 3).toISOString(),
        addressLine1: '1 Main St', postalCode: 'T2N 1N4',
      },
    }));

    // Second booking: 16:00–19:00 (starts inside first booking)
    const customer2 = await seedUser(pool, { fullName: 'Customer D' });
    const res = await createHandler(makeEvent({
      token: makeToken(customer2.id, { roles: ['CUSTOMER'] }),
      body: {
        maidId: maid.id,
        startAt: addHours(monday, 2).toISOString(),
        endAt:   addHours(monday, 5).toISOString(),
        addressLine1: '2 Main St', postalCode: 'T2N 1N4',
      },
    }));
    expect(res.statusCode).toBe(409);
  });

  it('allows booking an adjacent (non-overlapping) slot', async () => {
    const { customerUser, maid, monday } = await setup();
    const token = makeToken(customerUser.id, { roles: ['CUSTOMER'] });

    // First booking: 14:00–17:00
    await createHandler(makeEvent({
      token,
      body: {
        maidId: maid.id,
        startAt: monday.toISOString(),
        endAt:   addHours(monday, 3).toISOString(),
        addressLine1: '1 Main St', postalCode: 'T2N 1N4',
      },
    }));

    // Second booking: 17:00–20:00 (immediately adjacent — TSTZRANGE is [start, end))
    const customer2 = await seedUser(pool, { fullName: 'Customer E' });
    const res = await createHandler(makeEvent({
      token: makeToken(customer2.id, { roles: ['CUSTOMER'] }),
      body: {
        maidId: maid.id,
        startAt: addHours(monday, 3).toISOString(),
        endAt:   addHours(monday, 6).toISOString(),
        addressLine1: '3 Main St', postalCode: 'T2N 1N4',
      },
    }));
    expect(res.statusCode).toBe(201);
  });

  it('frees the slot after cancellation so it can be rebooked', async () => {
    const { customerUser, maid, monday } = await setup();
    const token = makeToken(customerUser.id, { roles: ['CUSTOMER'] });

    const body = {
      maidId: maid.id,
      startAt: monday.toISOString(),
      endAt:   addHours(monday, 3).toISOString(),
      addressLine1: '1 Main St', postalCode: 'T2N 1N4',
    };

    // Create then cancel
    const created = await createHandler(makeEvent({ token, body }));
    expect(created.statusCode).toBe(201);
    const bookingId = (JSON.parse(created.body) as { data: { id: string } }).data.id;

    const cancelled = await cancelHandler(makeEvent({
      method:          'DELETE',
      token,
      pathParameters:  { id: bookingId },
      body:            { reason: 'test cancel' },
    }));
    expect(cancelled.statusCode).toBe(204);

    // Same slot should now be available
    const customer2 = await seedUser(pool, { fullName: 'Customer F' });
    const res2 = await createHandler(makeEvent({
      token: makeToken(customer2.id, { roles: ['CUSTOMER'] }),
      body,
    }));
    expect(res2.statusCode).toBe(201);
  });
});

describe('EXCLUDE constraint — DB-level backstop', () => {
  it('fires 23P01 on a raw overlapping INSERT (simulates two requests racing past the soft check)', async () => {
    const { maid, monday } = await setup();
    const custA = await seedUser(pool, { fullName: 'Race A' });
    const custB = await seedUser(pool, { fullName: 'Race B' });

    const range  = `[${monday.toISOString()}, ${addHours(monday, 3).toISOString()})`;
    const insert = (custId: string) =>
      pool.query(
        `INSERT INTO bookings
           (customer_id, maid_id, during, address_line1, city, postal_code, total_price)
         VALUES ($1, $2, $3::tstzrange, '1 Race St', 'Calgary', 'T2N1N4', 90)`,
        [custId, maid.id, range],
      );

    await insert(custA.id);
    await expect(insert(custB.id)).rejects.toMatchObject({ code: '23P01' });
  });
});

describe('validation guardrails', () => {
  it('rejects a non-Calgary postal code (400)', async () => {
    const { customerUser, maid, monday } = await setup();
    const token = makeToken(customerUser.id, { roles: ['CUSTOMER'] });

    const res = await createHandler(makeEvent({
      token,
      body: {
        maidId: maid.id,
        startAt: monday.toISOString(),
        endAt:   addHours(monday, 3).toISOString(),
        addressLine1: '1 Main St',
        postalCode:   'M5V 3A9',   // Toronto — not Calgary
      },
    }));
    expect(res.statusCode).toBe(400);
  });

  it('rejects a booking shorter than 3 hours (400)', async () => {
    const { customerUser, maid, monday } = await setup();
    const token = makeToken(customerUser.id, { roles: ['CUSTOMER'] });

    const res = await createHandler(makeEvent({
      token,
      body: {
        maidId: maid.id,
        startAt: monday.toISOString(),
        endAt:   addHours(monday, 1).toISOString(),  // only 1 hour
        addressLine1: '1 Main St',
        postalCode:   'T2N 1N4',
      },
    }));
    expect(res.statusCode).toBe(400);
  });

  it('rejects a booking outside the maid\'s availability window (400)', async () => {
    const { customerUser, maid, monday } = await setup();
    // Availability is 08:00–20:00 UTC; book at 06:00–09:00 (before window opens).
    // assertMaidAvailable checks: window.start("08:00") <= startTime("06:00") → false → not covered → 400.
    const earlyStart = new Date(monday);
    earlyStart.setUTCHours(6, 0, 0, 0);

    const res = await createHandler(makeEvent({
      token: makeToken(customerUser.id, { roles: ['CUSTOMER'] }),
      body: {
        maidId: maid.id,
        startAt: earlyStart.toISOString(),
        endAt:   addHours(earlyStart, 3).toISOString(),
        addressLine1: '1 Main St',
        postalCode:   'T2N 1N4',
      },
    }));
    expect(res.statusCode).toBe(400);
  });
});
