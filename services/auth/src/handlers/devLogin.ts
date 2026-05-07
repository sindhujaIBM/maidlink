/**
 * POST /auth/dev-login
 *
 * DEV ONLY — issues a JWT for any seeded user without Google OAuth.
 * Blocked in production (NODE_ENV === 'production').
 *
 * Body: { userId: string }
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool, signToken, toErrorResponse, corsOrigin, ValidationError, NotFoundError } from '@maidlink/shared';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const origin = corsOrigin(event);
  const corsHeaders = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Content-Type': 'application/json' };
  if (process.env.NODE_ENV === 'production') {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({ error: { message: 'Not available in production' } }),
    };
  }

  try {
    if (!event.body) throw new ValidationError('Request body is required');
    const { userId } = JSON.parse(event.body) as { userId?: string };
    if (!userId) throw new ValidationError('userId is required');

    const pool = getPool();

    const { rows: [user] } = await pool.query(
      'SELECT id, email, full_name, avatar_url FROM users WHERE id = $1',
      [userId]
    );
    if (!user) throw new NotFoundError('User not found');

    const { rows: roleRows } = await pool.query(
      'SELECT role FROM user_roles WHERE user_id = $1',
      [userId]
    );
    const roles = roleRows.map((r: { role: string }) => r.role);

    let maidStatus: string | undefined;
    let maidProfileId: string | undefined;
    if (roles.includes('MAID')) {
      const { rows: [maid] } = await pool.query(
        'SELECT id, status FROM maid_profiles WHERE user_id = $1',
        [userId]
      );
      if (maid) { maidStatus = maid.status; maidProfileId = maid.id; }
    }

    const accessToken = signToken({ sub: user.id, email: user.email, roles, maidStatus, maidProfileId });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        data: {
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
        },
      }),
    };
  } catch (err) {
    return toErrorResponse(err, origin);
  }
}
