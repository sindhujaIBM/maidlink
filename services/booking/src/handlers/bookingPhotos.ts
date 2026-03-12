/**
 * GET  /bookings/{id}/after-photos/upload-url  — maid gets a pre-signed PUT URL
 * PATCH /bookings/{id}/after-photos             — maid submits S3 keys after upload
 *
 * Only the maid who owns the booking can upload completion photos.
 * Photos are stored under booking-after-photos/{bookingId}/ in PHOTOS_BUCKET.
 */

import type { APIGatewayProxyEvent } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import {
  withAuth, ok, getPool,
  ValidationError, NotFoundError, ForbiddenError,
} from '@maidlink/shared';

const s3     = new S3Client({ region: process.env.AWS_REGION || 'ca-west-1' });
const BUCKET = process.env.PHOTOS_BUCKET!;

// ── GET /bookings/{id}/after-photos/upload-url ────────────────────────────────

export const getUploadUrlHandler = withAuth(async (event: APIGatewayProxyEvent, auth) => {
  const id = event.pathParameters?.id;
  if (!id) throw new NotFoundError('Booking ID is required');

  const pool = getPool();
  const { rows: [booking] } = await pool.query(
    `SELECT b.id, b.status, mp.user_id AS maid_user_id
     FROM bookings b
     JOIN maid_profiles mp ON mp.id = b.maid_id
     WHERE b.id = $1`,
    [id]
  );

  if (!booking) throw new NotFoundError('Booking not found');
  if (booking.maid_user_id !== auth.userId) throw new ForbiddenError('Only the assigned maid can upload completion photos');
  if (booking.status !== 'COMPLETED') throw new ValidationError('Photos can only be uploaded after the job is marked complete');

  const s3Key = `booking-after-photos/${id}/${Date.now()}-${randomUUID()}.jpg`;
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: s3Key, ContentType: 'image/jpeg' }),
    { expiresIn: 3600 }
  );

  return ok({ uploadUrl, s3Key });
});

// ── PATCH /bookings/{id}/after-photos ─────────────────────────────────────────

export const submitHandler = withAuth(async (event: APIGatewayProxyEvent, auth) => {
  const id = event.pathParameters?.id;
  if (!id) throw new NotFoundError('Booking ID is required');
  if (!event.body) throw new ValidationError('Request body is required');

  const { s3Keys } = JSON.parse(event.body) as { s3Keys: string[] };
  if (!Array.isArray(s3Keys) || s3Keys.length === 0) throw new ValidationError('s3Keys array is required');
  if (s3Keys.length > 10) throw new ValidationError('Maximum 10 after photos allowed');

  // Validate all keys are scoped to this booking's prefix
  for (const key of s3Keys) {
    if (!key.startsWith(`booking-after-photos/${id}/`)) {
      throw new ValidationError('Invalid photo key');
    }
  }

  const pool = getPool();
  const { rows: [booking] } = await pool.query(
    `SELECT b.id, b.status, mp.user_id AS maid_user_id
     FROM bookings b
     JOIN maid_profiles mp ON mp.id = b.maid_id
     WHERE b.id = $1`,
    [id]
  );

  if (!booking) throw new NotFoundError('Booking not found');
  if (booking.maid_user_id !== auth.userId) throw new ForbiddenError('Only the assigned maid can submit completion photos');
  if (booking.status !== 'COMPLETED') throw new ValidationError('Photos can only be submitted after the job is marked complete');

  await pool.query(
    `UPDATE bookings
     SET after_photo_keys = after_photo_keys || $1::text[],
         updated_at = NOW()
     WHERE id = $2`,
    [s3Keys, id]
  );

  return ok({ uploaded: s3Keys.length });
});
