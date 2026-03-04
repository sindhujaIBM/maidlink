/**
 * POST /bookings/:id/review  — customer submits a review for a completed booking
 * GET  /reviews/maids/:maidId — list all reviews for a maid (public)
 */

import type { APIGatewayProxyEvent } from 'aws-lambda';
import {
  withAuth, ok, created, getPool,
  ValidationError, NotFoundError, ForbiddenError, ConflictError,
} from '@maidlink/shared';

// ─── POST /bookings/:id/review ────────────────────────────────────────────────

export const createHandler = withAuth(async (event: APIGatewayProxyEvent, auth) => {
  const bookingId = event.pathParameters?.id;
  if (!bookingId) throw new NotFoundError('Booking ID is required');

  if (!event.body) throw new ValidationError('Request body is required');
  const body = JSON.parse(event.body) as { rating?: unknown; comment?: unknown };

  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new ValidationError('rating must be an integer between 1 and 5');
  }
  const comment = typeof body.comment === 'string' ? body.comment.trim() || null : null;

  const pool = getPool();

  // Fetch booking — customer must own it and it must be COMPLETED
  const { rows: [booking] } = await pool.query(
    `SELECT id, customer_id, maid_id, status FROM bookings WHERE id = $1`,
    [bookingId]
  );
  if (!booking) throw new NotFoundError('Booking not found');
  if (booking.customer_id !== auth.userId) throw new ForbiddenError('Access denied');
  if (booking.status !== 'COMPLETED') {
    throw new ValidationError('Reviews can only be submitted for completed bookings');
  }

  // Check no review already exists (UNIQUE constraint on booking_id is the final guard)
  const { rows: [existing] } = await pool.query(
    `SELECT id FROM reviews WHERE booking_id = $1`,
    [bookingId]
  );
  if (existing) throw new ConflictError('A review has already been submitted for this booking');

  const { rows: [review] } = await pool.query(
    `INSERT INTO reviews (booking_id, customer_id, maid_id, rating, comment)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [bookingId, auth.userId, booking.maid_id, rating, comment]
  );

  return created({
    id:         review.id,
    bookingId:  review.booking_id,
    customerId: review.customer_id,
    maidId:     review.maid_id,
    rating:     review.rating,
    comment:    review.comment,
    createdAt:  review.created_at,
  });
});

// ─── GET /reviews/maids/:maidId ───────────────────────────────────────────────

export const listByMaidHandler = withAuth(async (event: APIGatewayProxyEvent, _auth) => {
  const maidId = event.pathParameters?.maidId;
  if (!maidId) throw new NotFoundError('Maid ID is required');

  const { page = '1', limit = '20' } =
    (event.queryStringParameters || {}) as Record<string, string>;

  const offset = (Number(page) - 1) * Number(limit);

  const pool = getPool();

  const { rows } = await pool.query(
    `SELECT
       r.id,
       r.booking_id,
       r.rating,
       r.comment,
       r.created_at,
       u.full_name AS customer_name,
       u.avatar_url AS customer_avatar
     FROM reviews r
     JOIN users u ON u.id = r.customer_id
     WHERE r.maid_id = $1
     ORDER BY r.created_at DESC
     LIMIT $2 OFFSET $3`,
    [maidId, Number(limit), offset]
  );

  const { rows: [{ total }] } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM reviews WHERE maid_id = $1`,
    [maidId]
  );

  return ok({
    reviews: rows.map(r => ({
      id:             r.id,
      bookingId:      r.booking_id,
      rating:         r.rating,
      comment:        r.comment,
      createdAt:      r.created_at,
      customerName:   r.customer_name,
      customerAvatar: r.customer_avatar,
    })),
    total,
    page:  Number(page),
    limit: Number(limit),
  });
});
