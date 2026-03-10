/**
 * POST /users/me/maid-profile  — register as maid (creates profile + adds MAID role)
 * GET  /users/me/maid-profile  — get own maid profile
 * PUT  /users/me/maid-profile  — update bio, rate, service area, experience
 */

import type { APIGatewayProxyEvent } from 'aws-lambda';
import {
  withAuth, ok, created, getPool,
  ValidationError, NotFoundError,
  isCalgaryPostal, CALGARY_FSA_PREFIXES,
} from '@maidlink/shared';
import { getPhotoUrl } from '../lib/s3';

// Validate that all service area codes are known Calgary FSAs
function validateServiceAreaCodes(codes: unknown): string[] {
  if (!Array.isArray(codes) || codes.length === 0) {
    throw new ValidationError('serviceAreaCodes must be a non-empty array of Calgary FSA codes');
  }
  for (const code of codes) {
    if (typeof code !== 'string' || !CALGARY_FSA_PREFIXES.has(code.toUpperCase())) {
      throw new ValidationError(`Invalid Calgary FSA code: ${code}`);
    }
  }
  return codes.map((c: string) => c.toUpperCase());
}

export const createHandler = withAuth(async (event: APIGatewayProxyEvent, auth) => {
  if (!event.body) throw new ValidationError('Request body is required');

  const body = JSON.parse(event.body) as {
    bio?: string;
    hourlyRate: number;
    serviceAreaCodes: string[];
    yearsExperience?: number;
    photoS3Key?: string;
    idDocS3Key?: string;
  };

  if (!body.hourlyRate || body.hourlyRate <= 0) {
    throw new ValidationError('hourlyRate must be a positive number');
  }
  if (!body.photoS3Key) {
    throw new ValidationError('A profile photo is required to submit your application.');
  }
  if (!body.idDocS3Key) {
    throw new ValidationError('A government ID document is required to submit your application.');
  }

  const serviceCodes = validateServiceAreaCodes(body.serviceAreaCodes);

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if profile already exists
    const { rows: existing } = await client.query(
      'SELECT id FROM maid_profiles WHERE user_id = $1',
      [auth.userId]
    );
    if (existing.length > 0) {
      throw new ValidationError('Maid profile already exists. Use PUT to update it.');
    }

    // Create profile (status = PENDING; admin must approve before bookable)
    const { rows: [maid] } = await client.query(
      `INSERT INTO maid_profiles
         (user_id, bio, hourly_rate, service_area_codes, years_experience, photo_s3_key, id_doc_s3_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        auth.userId,
        body.bio || null,
        body.hourlyRate,
        serviceCodes,
        body.yearsExperience || 0,
        body.photoS3Key,
        body.idDocS3Key,
      ]
    );

    // Grant MAID role (idempotent)
    await client.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, 'MAID')
       ON CONFLICT (user_id, role) DO NOTHING`,
      [auth.userId]
    );

    await client.query('COMMIT');
    return created(maid);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

export const getHandler = withAuth(async (_event: APIGatewayProxyEvent, auth) => {
  const { rows: [maid] } = await getPool().query(
    'SELECT * FROM maid_profiles WHERE user_id = $1',
    [auth.userId]
  );
  if (!maid) throw new NotFoundError('Maid profile not found');

  const photoUrl = await getPhotoUrl(maid.photo_s3_key);
  return ok({ ...maid, photoUrl });
});

export const updateHandler = withAuth(async (event: APIGatewayProxyEvent, auth) => {
  if (!event.body) throw new ValidationError('Request body is required');

  const body = JSON.parse(event.body) as {
    bio?: string;
    hourlyRate?: number;
    serviceAreaCodes?: string[];
    yearsExperience?: number;
    photoS3Key?: string;
    idDocS3Key?: string;
  };

  const { rows: [existing] } = await getPool().query(
    'SELECT id FROM maid_profiles WHERE user_id = $1',
    [auth.userId]
  );
  if (!existing) throw new NotFoundError('Maid profile not found');

  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (body.bio !== undefined)         { fields.push(`bio = $${idx++}`);               values.push(body.bio); }
  if (body.hourlyRate !== undefined)  {
    if (body.hourlyRate <= 0) throw new ValidationError('hourlyRate must be positive');
    fields.push(`hourly_rate = $${idx++}`);
    values.push(body.hourlyRate);
  }
  if (body.serviceAreaCodes !== undefined) {
    fields.push(`service_area_codes = $${idx++}`);
    values.push(validateServiceAreaCodes(body.serviceAreaCodes));
  }
  if (body.yearsExperience !== undefined) { fields.push(`years_experience = $${idx++}`); values.push(body.yearsExperience); }
  if (body.photoS3Key !== undefined)      { fields.push(`photo_s3_key = $${idx++}`);     values.push(body.photoS3Key); }
  if (body.idDocS3Key !== undefined)      { fields.push(`id_doc_s3_key = $${idx++}`);    values.push(body.idDocS3Key); }

  if (fields.length === 0) throw new ValidationError('No fields to update');

  values.push(auth.userId);
  const { rows: [maid] } = await getPool().query(
    `UPDATE maid_profiles SET ${fields.join(', ')} WHERE user_id = $${idx} RETURNING *`,
    values
  );

  const photoUrl = await getPhotoUrl(maid.photo_s3_key);
  return ok({ ...maid, photoUrl });
}, ['MAID']);
