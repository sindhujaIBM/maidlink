/**
 * POST   /bookings      — create booking (concurrency-safe)
 * GET    /bookings      — list own bookings
 * GET    /bookings/:id  — get single booking
 * DELETE /bookings/:id  — cancel booking
 */

import type { APIGatewayProxyEvent } from 'aws-lambda';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  withAuth, ok, created, noContent, getPool,
  ValidationError, NotFoundError, ForbiddenError, ConflictError,
  isCalgaryPostal,
  assertMinDuration, assertFutureDate, assertValidDateRange,
} from '@maidlink/shared';
import { buildTstzRange, assertMaidAvailable } from '../lib/concurrency';
import { calculateTotalPrice } from '../lib/pricing';

const s3     = new S3Client({ region: process.env.AWS_REGION || 'ca-west-1' });
const BUCKET = process.env.PHOTOS_BUCKET!;

async function toPresignedUrls(keys: string[]): Promise<string[]> {
  if (!keys || keys.length === 0) return [];
  return Promise.all(
    keys.map(key => getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 3600 }))
  );
}

// ─── POST /bookings ──────────────────────────────────────────────────────────

export const createHandler = withAuth(async (event: APIGatewayProxyEvent, auth) => {
  if (!event.body) throw new ValidationError('Request body is required');

  const body = JSON.parse(event.body) as {
    maidId:           string;
    startAt:          string;
    endAt:            string;
    addressLine1:     string;
    addressLine2?:    string;
    postalCode:       string;
    notes?:           string;
    beforePhotoKeys?: string[];
  };

  if (!body.maidId)       throw new ValidationError('maidId is required');
  if (!body.startAt)      throw new ValidationError('startAt is required');
  if (!body.endAt)        throw new ValidationError('endAt is required');
  if (!body.addressLine1) throw new ValidationError('addressLine1 is required');
  if (!body.postalCode)   throw new ValidationError('postalCode is required');

  const startAt = new Date(body.startAt);
  const endAt   = new Date(body.endAt);

  // Basic date validations
  assertValidDateRange(startAt, endAt);
  assertFutureDate(startAt);
  assertMinDuration(startAt, endAt);

  // Calgary-only service area
  if (!isCalgaryPostal(body.postalCode)) {
    throw new ValidationError('Service is only available in Calgary (invalid postal code)');
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Step 1: Lock the maid profile row ──────────────────────────────────
    // SELECT FOR UPDATE serializes all concurrent booking attempts for this maid.
    // Only one transaction can hold this lock at a time, so subsequent requests
    // queue until the first one commits/rolls back.
    const { rows: [maid] } = await client.query<{
      id: string; hourly_rate: string; status: string;
    }>(
      `SELECT id, hourly_rate, status
       FROM maid_profiles
       WHERE id = $1
       FOR UPDATE`,
      [body.maidId]
    );

    if (!maid)                   throw new NotFoundError('Maid not found');
    if (maid.status !== 'APPROVED') throw new ValidationError('This maid is not available for booking');
    if (maid.id === auth.userId)    throw new ValidationError('You cannot book yourself');

    // ── Step 2: Check maid availability covers the slot ──────────────────
    await assertMaidAvailable(client, maid.id, startAt, endAt);

    // ── Step 3: Explicit overlap check (provides clean error message) ─────
    // The EXCLUDE constraint in step 4 is the final backstop, but this
    // gives a more informative 409 before we even attempt the INSERT.
    const { rows: conflicts } = await client.query(
      `SELECT id FROM bookings
       WHERE maid_id = $1
         AND status != 'CANCELLED'
         AND during && $2::tstzrange`,
      [maid.id, buildTstzRange(startAt, endAt)]
    );
    if (conflicts.length > 0) {
      throw new ConflictError('This time slot is already booked');
    }

    // ── Step 4: Insert booking ────────────────────────────────────────────
    // If two requests race through all the checks above, the EXCLUDE constraint
    // will reject the second INSERT with pg error code 23P01.
    const totalPrice = calculateTotalPrice(startAt, endAt, Number(maid.hourly_rate));

    // Validate beforePhotoKeys if provided
    const beforePhotoKeys = (body.beforePhotoKeys || []).filter(
      k => typeof k === 'string' && k.startsWith('estimator-photos/')
    );

    const { rows: [booking] } = await client.query(
      `INSERT INTO bookings
         (customer_id, maid_id, during, address_line1, address_line2,
          postal_code, notes, total_price, before_photo_keys)
       VALUES ($1, $2, $3::tstzrange, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        auth.userId,
        maid.id,
        buildTstzRange(startAt, endAt),
        body.addressLine1,
        body.addressLine2 || null,
        body.postalCode.toUpperCase(),
        body.notes || null,
        totalPrice,
        beforePhotoKeys,
      ]
    );

    await client.query('COMMIT');
    return created(formatBooking(booking));

  } catch (err) {
    await client.query('ROLLBACK');
    // pg exclusion_violation (23P01) — two concurrent requests raced through
    if ((err as NodeJS.ErrnoException & { code?: string }).code === '23P01') {
      throw new ConflictError('Time slot just became unavailable. Please try a different slot.');
    }
    throw err;
  } finally {
    client.release();
  }
});

// ─── GET /bookings ───────────────────────────────────────────────────────────

export const listHandler = withAuth(async (event: APIGatewayProxyEvent, auth) => {
  const { role = 'customer', status, page = '1', limit = '20' } =
    (event.queryStringParameters || {}) as Record<string, string>;

  const pool = getPool();
  const values: unknown[] = [];
  const conditions: string[] = [];
  let idx = 1;

  // Customers see their own bookings; maids see bookings for their profile
  if (role === 'maid' && auth.roles.includes('MAID')) {
    // Get maid profile id
    const { rows: [mp] } = await pool.query(
      'SELECT id FROM maid_profiles WHERE user_id = $1', [auth.userId]
    );
    if (!mp) return ok([]);
    conditions.push(`b.maid_id = $${idx++}`);
    values.push(mp.id);
  } else {
    conditions.push(`b.customer_id = $${idx++}`);
    values.push(auth.userId);
  }

  if (status) { conditions.push(`b.status = $${idx++}`); values.push(status.toUpperCase()); }

  const offset = (Number(page) - 1) * Number(limit);
  values.push(Number(limit), offset);

  const { rows } = await pool.query(
    `SELECT
       b.*,
       lower(b.during) AS start_at,
       upper(b.during) AS end_at,
       u.full_name  AS customer_name,
       mp.id        AS maid_profile_id,
       mu.full_name AS maid_name
     FROM bookings b
     JOIN users u  ON u.id = b.customer_id
     JOIN maid_profiles mp ON mp.id = b.maid_id
     JOIN users mu ON mu.id = mp.user_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY lower(b.during) DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    values
  );

  return ok(rows.map((r: Record<string, unknown>) => formatBookingWithNames(r)));
});

// ─── GET /bookings/:id ───────────────────────────────────────────────────────

export const getOneHandler = withAuth(async (event: APIGatewayProxyEvent, auth) => {
  const id = event.pathParameters?.id;
  if (!id) throw new NotFoundError('Booking ID is required');

  const pool = getPool();
  const { rows: [row] } = await pool.query(
    `SELECT
       b.*,
       lower(b.during) AS start_at,
       upper(b.during) AS end_at,
       u.full_name  AS customer_name,
       mp.id        AS maid_profile_id,
       mu.full_name AS maid_name,
       mp.user_id   AS maid_user_id
     FROM bookings b
     JOIN users u  ON u.id = b.customer_id
     JOIN maid_profiles mp ON mp.id = b.maid_id
     JOIN users mu ON mu.id = mp.user_id
     WHERE b.id = $1`,
    [id]
  );

  if (!row) throw new NotFoundError('Booking not found');

  // Only the customer or the maid can view the booking
  const isMaidOwner = row.maid_user_id === auth.userId;
  const isCustomer  = row.customer_id === auth.userId;
  const isAdmin     = auth.roles.includes('ADMIN');
  if (!isMaidOwner && !isCustomer && !isAdmin) {
    throw new ForbiddenError('Access denied');
  }

  const [beforePhotoUrls, afterPhotoUrls] = await Promise.all([
    toPresignedUrls(row.before_photo_keys || []),
    toPresignedUrls(row.after_photo_keys  || []),
  ]);

  return ok({ ...formatBookingWithNames(row), beforePhotoUrls, afterPhotoUrls });
});

// ─── PATCH /bookings/:id/complete ────────────────────────────────────────────

export const completeHandler = withAuth(async (event: APIGatewayProxyEvent, auth) => {
  const id = event.pathParameters?.id;
  if (!id) throw new NotFoundError('Booking ID is required');

  const pool = getPool();
  const { rows: [booking] } = await pool.query(
    `SELECT b.*, mp.user_id AS maid_user_id
     FROM bookings b
     JOIN maid_profiles mp ON mp.id = b.maid_id
     WHERE b.id = $1`,
    [id]
  );

  if (!booking) throw new NotFoundError('Booking not found');

  const isMaidOwner = booking.maid_user_id === auth.userId;
  const isCustomer  = booking.customer_id === auth.userId;
  const isAdmin     = auth.roles.includes('ADMIN');
  if (!isMaidOwner && !isCustomer && !isAdmin) {
    throw new ForbiddenError('Access denied');
  }

  if (booking.status === 'COMPLETED') {
    throw new ValidationError('Booking is already completed');
  }
  if (booking.status !== 'CONFIRMED') {
    throw new ValidationError('Only confirmed bookings can be marked as complete');
  }

  // Service must have started (lower bound of during range < NOW)
  const { rows: [{ started }] } = await pool.query(
    `SELECT lower(during) < NOW() AS started FROM bookings WHERE id = $1`,
    [id]
  );
  if (!started) {
    throw new ValidationError('Cannot complete a booking before it has started');
  }

  const { rows: [updated] } = await pool.query(
    `UPDATE bookings
     SET status = 'COMPLETED', updated_at = NOW()
     WHERE id = $1
     RETURNING *,
       lower(during) AS start_at,
       upper(during) AS end_at`,
    [id]
  );

  return ok(formatBooking(updated));
});

// ─── DELETE /bookings/:id ────────────────────────────────────────────────────

export const cancelHandler = withAuth(async (event: APIGatewayProxyEvent, auth) => {
  const id = event.pathParameters?.id;
  if (!id) throw new NotFoundError('Booking ID is required');

  const pool = getPool();
  const { rows: [booking] } = await pool.query(
    `SELECT b.*, mp.user_id AS maid_user_id
     FROM bookings b
     JOIN maid_profiles mp ON mp.id = b.maid_id
     WHERE b.id = $1`,
    [id]
  );

  if (!booking) throw new NotFoundError('Booking not found');

  const isMaidOwner = booking.maid_user_id === auth.userId;
  const isCustomer  = booking.customer_id === auth.userId;
  const isAdmin     = auth.roles.includes('ADMIN');
  if (!isMaidOwner && !isCustomer && !isAdmin) {
    throw new ForbiddenError('Access denied');
  }

  if (booking.status === 'CANCELLED') {
    throw new ValidationError('Booking is already cancelled');
  }

  const body = event.body ? JSON.parse(event.body) as { reason?: string } : {};

  await pool.query(
    `UPDATE bookings
     SET status = 'CANCELLED',
         cancelled_at     = NOW(),
         cancelled_by     = $2,
         cancellation_reason = $3
     WHERE id = $1`,
    [id, auth.userId, body.reason ?? null]
  );

  return noContent();
});

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatBooking(row: Record<string, unknown>) {
  return {
    id:                 row.id,
    customerId:         row.customer_id,
    maidId:             row.maid_id,
    status:             row.status,
    startAt:            row.start_at || row.during,
    endAt:              row.end_at,
    addressLine1:       row.address_line1,
    addressLine2:       row.address_line2,
    city:               row.city,
    postalCode:         row.postal_code,
    notes:              row.notes,
    totalPrice:         row.total_price,
    createdAt:          row.created_at,
    cancelledAt:        row.cancelled_at   ?? null,
    cancelledBy:        row.cancelled_by   ?? null,
    cancellationReason: row.cancellation_reason ?? null,
    beforePhotoKeys:    row.before_photo_keys || [],
    afterPhotoKeys:     row.after_photo_keys  || [],
  };
}

function formatBookingWithNames(row: Record<string, unknown>) {
  return {
    ...formatBooking(row),
    customerName: row.customer_name,
    maidName:     row.maid_name,
  };
}
