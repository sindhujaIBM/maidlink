/**
 * POST /auth/refresh
 *
 * Accepts a long-lived refresh token, validates it, rotates it,
 * and returns a new short-lived access token + new refresh token.
 *
 * Body: { refreshToken: string }
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { randomBytes } from 'crypto';
import { getPool, signToken, toErrorResponse, ValidationError, UnauthorizedError } from '@maidlink/shared';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': 'true',
  'Content-Type': 'application/json',
};

const REFRESH_TTL_DAYS = 30;

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    if (!event.body) throw new ValidationError('Request body is required');

    const { refreshToken } = JSON.parse(event.body) as { refreshToken?: string };
    if (!refreshToken) throw new ValidationError('refreshToken is required');

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Look up token — must exist, not expired, not revoked
      const { rows: [rt] } = await client.query<{
        id: string; user_id: string; expires_at: string; revoked_at: string | null;
      }>(
        `SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token = $1`,
        [refreshToken]
      );

      if (!rt)           throw new UnauthorizedError('Invalid refresh token');
      if (rt.revoked_at) throw new UnauthorizedError('Refresh token has been revoked');
      if (new Date(rt.expires_at) < new Date()) throw new UnauthorizedError('Refresh token expired');

      // Revoke used token (single-use rotation)
      await client.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [rt.id]);

      // Fetch fresh user + roles
      const { rows: [user] } = await client.query<{
        id: string; email: string; full_name: string; avatar_url: string | null;
      }>(`SELECT id, email, full_name, avatar_url FROM users WHERE id = $1`, [rt.user_id]);
      if (!user) throw new UnauthorizedError('User not found');

      const { rows: roleRows } = await client.query<{ role: string }>(
        'SELECT role FROM user_roles WHERE user_id = $1', [rt.user_id]
      );
      const roles = roleRows.map(r => r.role);

      let maidStatus: string | undefined;
      let maidProfileId: string | undefined;
      if (roles.includes('MAID')) {
        const { rows: [maid] } = await client.query<{ id: string; status: string }>(
          'SELECT id, status FROM maid_profiles WHERE user_id = $1', [rt.user_id]
        );
        if (maid) { maidStatus = maid.status; maidProfileId = maid.id; }
      }

      const accessToken = signToken({ sub: user.id, email: user.email, roles, maidStatus, maidProfileId });

      // Issue new refresh token
      const newRefreshToken = randomBytes(32).toString('hex');
      await client.query(
        `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, NOW() + $3::interval)`,
        [rt.user_id, newRefreshToken, `${REFRESH_TTL_DAYS} days`]
      );

      await client.query('COMMIT');

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          data: {
            accessToken,
            refreshToken: newRefreshToken,
            user: {
              id:           user.id,
              email:        user.email,
              fullName:     user.full_name,
              avatarUrl:    user.avatar_url,
              roles,
              maidStatus,
              maidProfileId,
            },
          },
        }),
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
