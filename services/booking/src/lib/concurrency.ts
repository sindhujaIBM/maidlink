import type { PoolClient } from 'pg';
import { ValidationError } from '@maidlink/shared';

/**
 * Builds a PostgreSQL TSTZRANGE literal from two Date objects.
 * Uses the half-open interval [start, end) which is standard for time ranges.
 */
export function buildTstzRange(start: Date, end: Date): string {
  return `[${start.toISOString()}, ${end.toISOString()})`;
}

type DayOfWeek = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';
const JS_DAY_TO_DOW: Record<number, DayOfWeek> = {
  0: 'SUN', 1: 'MON', 2: 'TUE', 3: 'WED', 4: 'THU', 5: 'FRI', 6: 'SAT',
};

/**
 * Checks that the maid's availability covers the requested [start, end) window.
 *
 * Algorithm:
 *   1. Look up recurring slots for the day-of-week.
 *   2. Apply overrides for the specific date (additions or blocks).
 *   3. Verify the requested window falls entirely within an available window.
 *
 * Only supports bookings within a single calendar day for MVP.
 * Cross-midnight bookings are rejected.
 */
export async function assertMaidAvailable(
  client: PoolClient,
  maidId: string,
  start: Date,
  end: Date
): Promise<void> {
  // Reject cross-midnight bookings (MVP limitation)
  const startDate = new Date(start);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(end);
  endDate.setHours(0, 0, 0, 0);
  if (startDate.getTime() !== endDate.getTime()) {
    throw new ValidationError('Cross-midnight bookings are not supported. Please book within a single day.');
  }

  const dayOfWeek = JS_DAY_TO_DOW[start.getUTCDay()];
  const dateStr   = start.toISOString().split('T')[0]; // 'YYYY-MM-DD'
  const startTime = start.toISOString().slice(11, 16); // 'HH:MM' in UTC, consistent with getSlotsHandler
  const endTime   = end.toISOString().slice(11, 16);

  // 1. Get recurring slots for this day
  const { rows: recurring } = await client.query<{ start_time: string; end_time: string }>(
    `SELECT start_time, end_time
     FROM availability_recurring
     WHERE maid_id = $1 AND day_of_week = $2`,
    [maidId, dayOfWeek]
  );

  // 2. Get overrides for this specific date
  const { rows: overrides } = await client.query<{
    start_time: string; end_time: string; is_available: boolean;
  }>(
    `SELECT start_time, end_time, is_available
     FROM availability_overrides
     WHERE maid_id = $1 AND override_date = $2`,
    [maidId, dateStr]
  );

  // Build effective available windows:
  //   start with recurring slots, then apply overrides
  type Window = { start: string; end: string };

  let windows: Window[] = recurring.map(r => ({
    start: r.start_time.slice(0, 5),
    end:   r.end_time.slice(0, 5),
  }));

  for (const override of overrides) {
    const ow = { start: override.start_time.slice(0, 5), end: override.end_time.slice(0, 5) };
    if (override.is_available) {
      windows.push(ow);
    } else {
      // Split windows that partially overlap the blocked range (mirrors getSlotsHandler)
      const trimmed: Window[] = [];
      for (const w of windows) {
        if (w.end <= ow.start || w.start >= ow.end) {
          trimmed.push(w);                                              // no overlap — keep
        } else {
          if (w.start < ow.start) trimmed.push({ start: w.start, end: ow.start }); // before block
          if (w.end   > ow.end)   trimmed.push({ start: ow.end,   end: w.end   }); // after block
        }
      }
      windows = trimmed;
    }
  }

  // 3. Check if the booking window is fully covered by any available window
  const covered = windows.some(w => w.start <= startTime && w.end >= endTime);

  if (!covered) {
    throw new ValidationError(
      `The maid is not available from ${startTime} to ${endTime} on ${dateStr}`
    );
  }
}
