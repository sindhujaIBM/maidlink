/**
 * GET /auth/me
 *
 * Returns the current user's profile and roles.
 * Requires: Authorization: Bearer <jwt>
 */

import type { APIGatewayProxyEvent } from 'aws-lambda';
import { withAuth, ok, getPool } from '@maidlink/shared';

export const handler = withAuth(async (_event: APIGatewayProxyEvent, auth) => {
  const pool = getPool();

  const { rows: [user] } = await pool.query(
    `SELECT id, email, full_name, avatar_url, phone, created_at
     FROM users WHERE id = $1`,
    [auth.userId]
  );

  const { rows: roleRows } = await pool.query(
    'SELECT role FROM user_roles WHERE user_id = $1',
    [auth.userId]
  );

  let maidProfile = null;
  if (auth.roles.includes('MAID')) {
    const { rows: [maid] } = await pool.query(
      `SELECT id, status, bio, hourly_rate, service_area_codes,
              years_experience, photo_s3_key, approved_at, rejected_reason
       FROM maid_profiles WHERE user_id = $1`,
      [auth.userId]
    );
    maidProfile = maid || null;
  }

  return ok({
    id:          user.id,
    email:       user.email,
    fullName:    user.full_name,
    avatarUrl:   user.avatar_url,
    phone:       user.phone,
    createdAt:   user.created_at,
    roles:       roleRows.map((r: { role: string }) => r.role),
    maidProfile,
  });
});
