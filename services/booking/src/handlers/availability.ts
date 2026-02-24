/**
 * Availability management (maid-only for write operations)
 * and slot query (anyone can read).
 *
 * GET    /availabilities                     — list own availability rules
 * POST   /availabilities/recurring           — add recurring slot
 * DELETE /availabilities/recurring/:id       — remove recurring slot
 * POST   /availabilities/overrides           — add one-off override
 * DELETE /availabilities/overrides/:id       — remove override
 * GET    /bookings/maids/:maidId/slots        — get free slots for date range
 */

import type { APIGatewayProxyEvent } from 'aws-lambda';
import {
  withAuth, ok, created, noContent, getPool,
  ValidationError, NotFoundError, ForbiddenError,
} from '@maidlink/shared';

const DAYS: string[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const TIME_RE = /^\d{2}:\d{2}$/;

function validateTime(val: unknown, field: string): string {
  if (typeof val !== 'string' || !TIME_RE.test(val)) {
    throw new ValidationError(`${field} must be in HH:MM format`);
  }
  return val;
}

// ─── GET /availabilities ─────────────────────────────────────────────────────

export const listHandler = withAuth(async (_event: APIGatewayProxyEvent, auth) => {
  const pool = getPool();
  const { rows: [mp] } = await pool.query(
    'SELECT id FROM maid_profiles WHERE user_id = $1', [auth.userId]
  );
  if (!mp) return ok({ recurring: [], overrides: [] });

  const [{ rows: recurring }, { rows: overrides }] = await Promise.all([
    pool.query(
      `SELECT id, day_of_week, start_time, end_time FROM availability_recurring
       WHERE maid_id = $1 ORDER BY day_of_week, start_time`,
      [mp.id]
    ),
    pool.query(
      `SELECT id, override_date, start_time, end_time, is_available
       FROM availability_overrides
       WHERE maid_id = $1 ORDER BY override_date, start_time`,
      [mp.id]
    ),
  ]);

  return ok({ recurring, overrides });
}, ['MAID']);

// ─── POST /availabilities/recurring ─────────────────────────────────────────

export const createRecurringHandler = withAuth(async (event: APIGatewayProxyEvent, auth) => {
  if (!event.body) throw new ValidationError('Request body is required');
  const body = JSON.parse(event.body) as { dayOfWeek: string; startTime: string; endTime: string };

  if (!DAYS.includes(body.dayOfWeek?.toUpperCase())) {
    throw new ValidationError(`dayOfWeek must be one of: ${DAYS.join(', ')}`);
  }
  const startTime = validateTime(body.startTime, 'startTime');
  const endTime   = validateTime(body.endTime, 'endTime');
  if (startTime >= endTime) throw new ValidationError('startTime must be before endTime');

  const pool = getPool();
  const { rows: [mp] } = await pool.query(
    'SELECT id FROM maid_profiles WHERE user_id = $1', [auth.userId]
  );
  if (!mp) throw new NotFoundError('Maid profile not found');

  const { rows: [slot] } = await pool.query(
    `INSERT INTO availability_recurring (maid_id, day_of_week, start_time, end_time)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [mp.id, body.dayOfWeek.toUpperCase(), startTime, endTime]
  );

  return created(slot);
}, ['MAID']);

// ─── DELETE /availabilities/recurring/:id ────────────────────────────────────

export const deleteRecurringHandler = withAuth(async (event: APIGatewayProxyEvent, auth) => {
  const id = event.pathParameters?.id;
  if (!id) throw new ValidationError('id is required');

  const pool = getPool();
  const { rows: [mp] } = await pool.query(
    'SELECT id FROM maid_profiles WHERE user_id = $1', [auth.userId]
  );
  if (!mp) throw new NotFoundError('Maid profile not found');

  const { rowCount } = await pool.query(
    'DELETE FROM availability_recurring WHERE id = $1 AND maid_id = $2',
    [id, mp.id]
  );
  if (!rowCount) throw new NotFoundError('Availability slot not found');

  return noContent();
}, ['MAID']);

// ─── POST /availabilities/overrides ─────────────────────────────────────────

export const createOverrideHandler = withAuth(async (event: APIGatewayProxyEvent, auth) => {
  if (!event.body) throw new ValidationError('Request body is required');
  const body = JSON.parse(event.body) as {
    overrideDate: string;
    startTime: string;
    endTime: string;
    isAvailable?: boolean;
  };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.overrideDate)) {
    throw new ValidationError('overrideDate must be in YYYY-MM-DD format');
  }
  const startTime  = validateTime(body.startTime, 'startTime');
  const endTime    = validateTime(body.endTime, 'endTime');
  if (startTime >= endTime) throw new ValidationError('startTime must be before endTime');

  const pool = getPool();
  const { rows: [mp] } = await pool.query(
    'SELECT id FROM maid_profiles WHERE user_id = $1', [auth.userId]
  );
  if (!mp) throw new NotFoundError('Maid profile not found');

  const { rows: [override] } = await pool.query(
    `INSERT INTO availability_overrides
       (maid_id, override_date, start_time, end_time, is_available)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [mp.id, body.overrideDate, startTime, endTime, body.isAvailable ?? true]
  );

  return created(override);
}, ['MAID']);

// ─── DELETE /availabilities/overrides/:id ────────────────────────────────────

export const deleteOverrideHandler = withAuth(async (event: APIGatewayProxyEvent, auth) => {
  const id = event.pathParameters?.id;
  if (!id) throw new ValidationError('id is required');

  const pool = getPool();
  const { rows: [mp] } = await pool.query(
    'SELECT id FROM maid_profiles WHERE user_id = $1', [auth.userId]
  );
  if (!mp) throw new NotFoundError('Maid profile not found');

  const { rowCount } = await pool.query(
    'DELETE FROM availability_overrides WHERE id = $1 AND maid_id = $2',
    [id, mp.id]
  );
  if (!rowCount) throw new NotFoundError('Override not found');

  return noContent();
}, ['MAID']);

// ─── GET /bookings/maids/:maidId/slots ───────────────────────────────────────

/**
 * Returns available time slots for a maid over a date range (max 14 days).
 *
 * Algorithm:
 *   For each date in [fromDate, toDate]:
 *     1. Expand recurring availability for the day-of-week
 *     2. Apply overrides (add extra slots or block existing ones)
 *     3. Subtract confirmed bookings
 *   → Return remaining free windows
 *
 * Query params: fromDate (YYYY-MM-DD), toDate (YYYY-MM-DD)
 */
export const getSlotsHandler = withAuth(async (event: APIGatewayProxyEvent) => {
  const maidId = event.pathParameters?.maidId;
  if (!maidId) throw new ValidationError('maidId is required');

  const { fromDate, toDate } = (event.queryStringParameters || {}) as {
    fromDate?: string; toDate?: string;
  };

  if (!fromDate || !toDate) {
    throw new ValidationError('fromDate and toDate query parameters are required (YYYY-MM-DD)');
  }

  const from = new Date(fromDate + 'T00:00:00Z');
  const to   = new Date(toDate   + 'T23:59:59Z');
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    throw new ValidationError('Invalid date format — use YYYY-MM-DD');
  }

  const diffDays = (to.getTime() - from.getTime()) / 86_400_000;
  if (diffDays > 14) throw new ValidationError('Date range cannot exceed 14 days');
  if (from > to)     throw new ValidationError('fromDate must be before toDate');

  const pool = getPool();

  // Verify maid exists and is approved
  const { rows: [maid] } = await pool.query(
    `SELECT id FROM maid_profiles WHERE id = $1 AND status = 'APPROVED'`,
    [maidId]
  );
  if (!maid) throw new NotFoundError('Maid not found');

  // Fetch all recurring slots for this maid
  const { rows: recurring } = await pool.query(
    `SELECT day_of_week, start_time, end_time FROM availability_recurring WHERE maid_id = $1`,
    [maidId]
  );

  // Fetch overrides for the date range
  const { rows: overrides } = await pool.query(
    `SELECT override_date, start_time, end_time, is_available
     FROM availability_overrides
     WHERE maid_id = $1 AND override_date BETWEEN $2 AND $3`,
    [maidId, fromDate, toDate]
  );

  // Fetch existing bookings for the range
  const { rows: bookings } = await pool.query(
    `SELECT lower(during) AS start_at, upper(during) AS end_at
     FROM bookings
     WHERE maid_id = $1
       AND status != 'CANCELLED'
       AND during && tstzrange($2::timestamptz, $3::timestamptz)`,
    [maidId, from.toISOString(), to.toISOString()]
  );

  const DOW_MAP: Record<string, number> = {
    SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
  };

  const slots: { date: string; startAt: string; endAt: string }[] = [];

  // Iterate each day in the range
  const cursor = new Date(from);
  while (cursor <= to) {
    const dateStr = cursor.toISOString().split('T')[0];
    const dayNum  = cursor.getUTCDay();

    // 1. Recurring for this day
    type Window = { start: string; end: string };
    let windows: Window[] = recurring
      .filter((r: { day_of_week: string }) => DOW_MAP[r.day_of_week] === dayNum)
      .map((r: { start_time: string; end_time: string }) => ({
        start: r.start_time.slice(0, 5),
        end:   r.end_time.slice(0, 5),
      }));

    // 2. Apply overrides for this date
    // pg returns `date` columns as Date objects, so normalise to YYYY-MM-DD string first
    const dayOverrides = overrides.filter((o: { override_date: string | Date }) => {
      const d = o.override_date instanceof Date
        ? o.override_date.toISOString().slice(0, 10)
        : String(o.override_date).slice(0, 10);
      return d === dateStr;
    });
    for (const o of dayOverrides) {
      const ow = { start: o.start_time.slice(0, 5), end: o.end_time.slice(0, 5) };
      if (o.is_available) {
        windows.push(ow);
      } else {
        // Split windows that partially overlap the blocked range
        const trimmed: Window[] = [];
        for (const w of windows) {
          if (w.end <= ow.start || w.start >= ow.end) {
            trimmed.push(w);                                         // no overlap — keep
          } else {
            if (w.start < ow.start) trimmed.push({ start: w.start, end: ow.start }); // before block
            if (w.end   > ow.end)   trimmed.push({ start: ow.end,   end: w.end   }); // after block
          }
        }
        windows = trimmed;
      }
    }

    // 3. Subtract bookings that fall on this day
    const dayBookings = bookings.filter((b: { start_at: string }) =>
      new Date(b.start_at).toISOString().startsWith(dateStr)
    );
    for (const b of dayBookings) {
      const bStart = new Date(b.start_at).toISOString().slice(11, 16);
      const bEnd   = new Date(b.end_at).toISOString().slice(11, 16);
      // Trim or remove overlapping windows
      const trimmed: Window[] = [];
      for (const w of windows) {
        if (w.end <= bStart || w.start >= bEnd) {
          trimmed.push(w);
        } else {
          if (w.start < bStart) trimmed.push({ start: w.start, end: bStart });
          if (w.end > bEnd)     trimmed.push({ start: bEnd, end: w.end });
        }
      }
      windows = trimmed;
    }

    // Emit slots that can accommodate at least 3 hours
    for (const w of windows) {
      const [sh, sm] = w.start.split(':').map(Number);
      const [eh, em] = w.end.split(':').map(Number);
      const durationH = (eh * 60 + em - (sh * 60 + sm)) / 60;
      if (durationH >= 3) {
        slots.push({
          date:    dateStr,
          startAt: `${dateStr}T${w.start}:00.000Z`,
          endAt:   `${dateStr}T${w.end}:00.000Z`,
        });
      }
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return ok(slots);
});
