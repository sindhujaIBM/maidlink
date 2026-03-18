/**
 * GET  /admin/maid-applications         — list applications (filterable by status)
 * POST /admin/maid-applications/:id/approve
 * POST /admin/maid-applications/:id/reject
 */

import type { APIGatewayProxyEvent } from 'aws-lambda';
import { withAuth, ok, getPool, NotFoundError } from '@maidlink/shared';

export const listHandler = withAuth(async (event: APIGatewayProxyEvent) => {
  const { status = 'new' } = (event.queryStringParameters || {}) as Record<string, string>;
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM maid_applications
     WHERE ($1 = 'all' OR status = $1)
     ORDER BY created_at DESC`,
    [status]
  );
  return ok(rows.map((r: Record<string, unknown>) => ({
    id:              r.id,
    fullName:        r.full_name,
    email:           r.email,
    phone:           r.phone,
    gender:          r.gender,
    age:             r.age,
    workEligibility: r.work_eligibility,
    yearsExperience: r.years_experience,
    bio:             r.bio,
    hourlyRatePref:  r.hourly_rate_pref,
    hasOwnSupplies:  r.has_own_supplies,
    canDrive:        r.can_drive,
    offersCooking:   r.offers_cooking,
    languages:       r.languages,
    availability:    r.availability,
    referralSource:  r.referral_source,
    hasPhoto:        !!r.photo_s3_key,
    hasIdDoc:        !!r.id_doc_s3_key,
    status:          r.status,
    notes:           r.notes,
    createdAt:       r.created_at,
  })));
}, ['ADMIN']);

export const approveHandler = withAuth(async (event: APIGatewayProxyEvent) => {
  const id = event.pathParameters?.id;
  if (!id) throw new NotFoundError('Missing id');
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE maid_applications SET status = 'approved' WHERE id = $1 RETURNING id`,
    [id]
  );
  if (rows.length === 0) throw new NotFoundError('Application not found');
  return ok({ id });
}, ['ADMIN']);

export const rejectHandler = withAuth(async (event: APIGatewayProxyEvent) => {
  const id = event.pathParameters?.id;
  if (!id) throw new NotFoundError('Missing id');
  const { notes } = JSON.parse(event.body || '{}');
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE maid_applications SET status = 'rejected', notes = COALESCE($2, notes) WHERE id = $1 RETURNING id`,
    [id, notes || null]
  );
  if (rows.length === 0) throw new NotFoundError('Application not found');
  return ok({ id });
}, ['ADMIN']);
