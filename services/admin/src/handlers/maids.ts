/**
 * Admin: maid management
 *
 * GET  /admin/maids                        — list maids (filterable by status)
 * POST /admin/maids/:maidId/approve        — approve maid
 * POST /admin/maids/:maidId/reject         — reject maid with reason
 * POST /admin/maids/:maidId/verify         — mark maid as verified
 * POST /admin/maids/:maidId/unverify       — remove verification
 * GET  /admin/maids/:maidId/id-doc-url     — get pre-signed URL to view maid's ID document
 */

import type { APIGatewayProxyEvent } from 'aws-lambda';
import {
  withAuth, ok, getPool,
  ValidationError, NotFoundError,
} from '@maidlink/shared';
import { getIdDocViewUrl } from '../lib/s3';

export const listHandler = withAuth(async (event: APIGatewayProxyEvent) => {
  const { status = 'PENDING', page = '1', limit = '50' } =
    (event.queryStringParameters || {}) as Record<string, string>;

  const pool = getPool();
  const offset = (Number(page) - 1) * Number(limit);

  const { rows } = await pool.query(
    `SELECT
       mp.*,
       u.email,
       u.full_name,
       u.avatar_url,
       u.created_at AS user_created_at,
       ab.full_name AS approved_by_name
     FROM maid_profiles mp
     JOIN users u ON u.id = mp.user_id
     LEFT JOIN users ab ON ab.id = mp.approved_by
     WHERE ($1::text = 'ALL' OR mp.status = $1::maid_status)
     ORDER BY mp.created_at DESC
     LIMIT $2 OFFSET $3`,
    [status.toUpperCase(), Number(limit), offset]
  );

  const { rows: [{ count }] } = await pool.query(
    `SELECT COUNT(*) AS count FROM maid_profiles
     WHERE ($1::text = 'ALL' OR status = $1::maid_status)`,
    [status.toUpperCase()]
  );

  return ok({
    maids: rows.map((r: Record<string, unknown>) => ({
      id:              r.id,
      status:          r.status,
      bio:             r.bio,
      hourlyRate:      r.hourly_rate,
      serviceAreaCodes: r.service_area_codes,
      yearsExperience: r.years_experience,
      rejectedReason:  r.rejected_reason,
      approvedAt:      r.approved_at,
      approvedByName:  r.approved_by_name,
      isVerified:      r.is_verified,
      hasIdDoc:        !!r.id_doc_s3_key,
      verifiedAt:      r.verified_at,
      createdAt:       r.created_at,
      user: {
        id:         r.user_id,
        email:      r.email,
        fullName:   r.full_name,
        avatarUrl:  r.avatar_url,
        createdAt:  r.user_created_at,
      },
    })),
    total: Number(count),
    page:  Number(page),
    limit: Number(limit),
  });
}, ['ADMIN']);

export const approveHandler = withAuth(async (event: APIGatewayProxyEvent, auth) => {
  const maidId = event.pathParameters?.maidId;
  if (!maidId) throw new ValidationError('maidId is required');

  const pool = getPool();
  const { rows: [maid] } = await pool.query(
    'SELECT id, status FROM maid_profiles WHERE id = $1',
    [maidId]
  );

  if (!maid) throw new NotFoundError('Maid profile not found');
  if (maid.status === 'APPROVED') throw new ValidationError('Maid is already approved');

  const { rows: [updated] } = await pool.query(
    `UPDATE maid_profiles
     SET status = 'APPROVED', approved_by = $1, approved_at = NOW(), rejected_reason = NULL
     WHERE id = $2
     RETURNING id, status, approved_at`,
    [auth.userId, maidId]
  );

  return ok(updated);
}, ['ADMIN']);

export const rejectHandler = withAuth(async (event: APIGatewayProxyEvent, auth) => {
  const maidId = event.pathParameters?.maidId;
  if (!maidId) throw new ValidationError('maidId is required');

  const body = event.body ? JSON.parse(event.body) as { reason?: string } : {};
  const reason = body.reason?.trim();
  if (!reason) throw new ValidationError('A rejection reason is required');

  const pool = getPool();
  const { rows: [maid] } = await pool.query(
    'SELECT id, status FROM maid_profiles WHERE id = $1',
    [maidId]
  );

  if (!maid) throw new NotFoundError('Maid profile not found');

  const { rows: [updated] } = await pool.query(
    `UPDATE maid_profiles
     SET status = 'REJECTED', rejected_reason = $1, approved_by = $2, approved_at = NOW()
     WHERE id = $3
     RETURNING id, status, rejected_reason`,
    [reason, auth.userId, maidId]
  );

  return ok(updated);
}, ['ADMIN']);

export const verifyHandler = withAuth(async (event: APIGatewayProxyEvent, auth) => {
  const maidId = event.pathParameters?.maidId;
  if (!maidId) throw new ValidationError('maidId is required');

  const pool = getPool();
  const { rows: [maid] } = await pool.query(
    'SELECT id FROM maid_profiles WHERE id = $1',
    [maidId]
  );
  if (!maid) throw new NotFoundError('Maid profile not found');

  const { rows: [updated] } = await pool.query(
    `UPDATE maid_profiles
     SET is_verified = TRUE, verified_by = $1, verified_at = NOW()
     WHERE id = $2
     RETURNING id, is_verified, verified_at`,
    [auth.userId, maidId]
  );

  return ok(updated);
}, ['ADMIN']);

export const unverifyHandler = withAuth(async (event: APIGatewayProxyEvent) => {
  const maidId = event.pathParameters?.maidId;
  if (!maidId) throw new ValidationError('maidId is required');

  const pool = getPool();
  const { rows: [maid] } = await pool.query(
    'SELECT id FROM maid_profiles WHERE id = $1',
    [maidId]
  );
  if (!maid) throw new NotFoundError('Maid profile not found');

  const { rows: [updated] } = await pool.query(
    `UPDATE maid_profiles
     SET is_verified = FALSE, verified_by = NULL, verified_at = NULL
     WHERE id = $1
     RETURNING id, is_verified`,
    [maidId]
  );

  return ok(updated);
}, ['ADMIN']);

export const getIdDocUrlHandler = withAuth(async (event: APIGatewayProxyEvent) => {
  const maidId = event.pathParameters?.maidId;
  if (!maidId) throw new ValidationError('maidId is required');

  const pool = getPool();
  const { rows: [maid] } = await pool.query(
    'SELECT id_doc_s3_key FROM maid_profiles WHERE id = $1',
    [maidId]
  );
  if (!maid) throw new NotFoundError('Maid profile not found');
  if (!maid.id_doc_s3_key) throw new NotFoundError('No ID document uploaded for this maid');

  const url = await getIdDocViewUrl(maid.id_doc_s3_key);
  return ok({ url });
}, ['ADMIN']);
