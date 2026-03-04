/**
 * GET /bookings/earnings — maid's financial summary
 * Returns: aggregate totals + completed booking history + upcoming confirmed bookings
 */

import type { APIGatewayProxyEvent } from 'aws-lambda';
import {
  withAuth, ok, getPool,
  ValidationError,
} from '@maidlink/shared';

export const getEarningsHandler = withAuth(async (event: APIGatewayProxyEvent, auth) => {
  if (!auth.maidProfileId) {
    throw new ValidationError('Maid profile not found');
  }

  const maidId = auth.maidProfileId;
  const pool = getPool();

  // ── Aggregate summary ────────────────────────────────────────────────────
  const { rows: [summary] } = await pool.query(
    `SELECT
       COALESCE(SUM(total_price) FILTER (WHERE status = 'COMPLETED'), 0)::numeric AS total_earned,
       COALESCE(SUM(total_price) FILTER (
         WHERE status = 'COMPLETED'
           AND date_trunc('month', lower(during)) = date_trunc('month', NOW())
       ), 0)::numeric AS this_month_earned,
       COALESCE(SUM(total_price) FILTER (WHERE status = 'CONFIRMED'), 0)::numeric AS pending_earnings,
       COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed_count,
       COUNT(*) FILTER (WHERE status = 'CONFIRMED')::int AS upcoming_count
     FROM bookings
     WHERE maid_id = $1`,
    [maidId]
  );

  // ── Completed bookings (earnings history, most recent first) ─────────────
  const { rows: completedBookings } = await pool.query(
    `SELECT
       b.id,
       lower(b.during) AS start_at,
       upper(b.during) AS end_at,
       b.total_price,
       b.created_at,
       u.full_name AS customer_name
     FROM bookings b
     JOIN users u ON u.id = b.customer_id
     WHERE b.maid_id = $1 AND b.status = 'COMPLETED'
     ORDER BY lower(b.during) DESC
     LIMIT 20`,
    [maidId]
  );

  // ── Upcoming confirmed bookings ───────────────────────────────────────────
  const { rows: upcomingBookings } = await pool.query(
    `SELECT
       b.id,
       lower(b.during) AS start_at,
       upper(b.during) AS end_at,
       b.total_price,
       u.full_name AS customer_name
     FROM bookings b
     JOIN users u ON u.id = b.customer_id
     WHERE b.maid_id = $1
       AND b.status = 'CONFIRMED'
       AND lower(b.during) > NOW()
     ORDER BY lower(b.during) ASC
     LIMIT 20`,
    [maidId]
  );

  return ok({
    summary: {
      totalEarned:      summary.total_earned,
      thisMonthEarned:  summary.this_month_earned,
      pendingEarnings:  summary.pending_earnings,
      completedCount:   summary.completed_count,
      upcomingCount:    summary.upcoming_count,
    },
    completedBookings: completedBookings.map(b => ({
      id:           b.id,
      startAt:      b.start_at,
      endAt:        b.end_at,
      totalPrice:   b.total_price,
      customerName: b.customer_name,
      createdAt:    b.created_at,
    })),
    upcomingBookings: upcomingBookings.map(b => ({
      id:           b.id,
      startAt:      b.start_at,
      endAt:        b.end_at,
      totalPrice:   b.total_price,
      customerName: b.customer_name,
    })),
  });
}, ['MAID']);
