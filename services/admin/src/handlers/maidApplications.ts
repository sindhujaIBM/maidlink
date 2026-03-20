/**
 * GET  /admin/maid-applications              — list applications (filterable by status)
 * POST /admin/maid-applications/:id/approve
 * POST /admin/maid-applications/:id/reject
 * GET  /admin/maid-applications/:id/id-doc-url
 */

import type { APIGatewayProxyEvent } from 'aws-lambda';
import { withAuth, ok, getPool, NotFoundError } from '@maidlink/shared';
import { getPhotoViewUrl, getIdDocViewUrl } from '../lib/s3';

export const listHandler = withAuth(async (event: APIGatewayProxyEvent) => {
  const { status = 'new' } = (event.queryStringParameters || {}) as Record<string, string>;
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM maid_applications
     WHERE ($1 = 'all' OR status = $1)
     ORDER BY created_at DESC`,
    [status]
  );
  const applications = await Promise.all(rows.map(async (r: Record<string, unknown>) => ({
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
    photoUrl:        r.photo_s3_key ? await getPhotoViewUrl(r.photo_s3_key as string) : null,
    hasIdDoc:        !!r.id_doc_s3_key,
    status:          r.status,
    notes:           r.notes,
    createdAt:       r.created_at,
  })));
  return ok(applications);
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

export const getIdDocUrlHandler = withAuth(async (event: APIGatewayProxyEvent) => {
  const id = event.pathParameters?.id;
  if (!id) throw new NotFoundError('Missing id');
  const pool = getPool();
  const { rows: [app] } = await pool.query(
    'SELECT id_doc_s3_key FROM maid_applications WHERE id = $1',
    [id]
  );
  if (!app) throw new NotFoundError('Application not found');
  if (!app.id_doc_s3_key) throw new NotFoundError('No ID document uploaded for this application');
  const url = await getIdDocViewUrl(app.id_doc_s3_key);
  return ok({ url });
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
