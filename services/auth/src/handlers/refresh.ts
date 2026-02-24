/**
 * POST /auth/refresh
 *
 * Re-issues a JWT reflecting the user's current DB roles.
 * Useful after role changes (e.g. applying as a maid) without re-doing Google OAuth.
 *
 * Requires: Authorization: Bearer <current-jwt>
 */

import type { APIGatewayProxyEvent } from 'aws-lambda';
import { withAuth, ok, getPool, signToken } from '@maidlink/shared';

export const handler = withAuth(async (_event: APIGatewayProxyEvent, auth) => {
  const pool = getPool();

  const { rows: [user] } = await pool.query(
    `SELECT id, email, full_name, avatar_url FROM users WHERE id = $1`,
    [auth.userId]
  );

  const { rows: roleRows } = await pool.query(
    'SELECT role FROM user_roles WHERE user_id = $1',
    [auth.userId]
  );
  const roles = roleRows.map((r: { role: string }) => r.role);

  let maidStatus: string | undefined;
  let maidProfileId: string | undefined;
  if (roles.includes('MAID')) {
    const { rows: [maid] } = await pool.query(
      'SELECT id, status FROM maid_profiles WHERE user_id = $1',
      [auth.userId]
    );
    if (maid) {
      maidStatus     = maid.status;
      maidProfileId  = maid.id;
    }
  }

  const accessToken = signToken({
    sub:           user.id,
    email:         user.email,
    roles,
    maidStatus,
    maidProfileId,
  });

  return ok({
    accessToken,
    user: {
      id:        user.id,
      email:     user.email,
      fullName:  user.full_name,
      avatarUrl: user.avatar_url,
      roles,
      maidStatus,
      maidProfileId,
    },
  });
});
