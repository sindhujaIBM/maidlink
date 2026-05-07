/**
 * POST /auth/google
 *
 * Accepts a Google authorization code, exchanges it for an id_token,
 * upserts the user in the database, and returns a signed application JWT.
 *
 * Body: { code: string, redirectUri: string }
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { randomBytes } from 'crypto';
import { getPool, signToken, toErrorResponse, corsOrigin, ValidationError } from '@maidlink/shared';
import { exchangeCodeForTokens, verifyIdToken } from '../lib/googleOAuth';

const REFRESH_TTL_DAYS = 30;

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const origin = corsOrigin(event);
  const corsHeaders = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Content-Type': 'application/json' };
  try {
    if (!event.body) throw new ValidationError('Request body is required');

    const body = JSON.parse(event.body) as { code?: string; redirectUri?: string };
    if (!body.code)        throw new ValidationError('code is required');
    if (!body.redirectUri) throw new ValidationError('redirectUri is required');

    // 1. Exchange authorization code for Google tokens
    const tokens = await exchangeCodeForTokens(body.code, body.redirectUri);

    // 2. Verify and decode the id_token
    const googleUser = await verifyIdToken(tokens.id_token);

    // 3. Upsert user + ensure CUSTOMER role exists
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Upsert user — Google sub is immutable so we key on that
      const { rows: [user] } = await client.query<{
        id: string; email: string; full_name: string; avatar_url: string | null;
      }>(
        `INSERT INTO users (google_sub, email, full_name, avatar_url)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (google_sub) DO UPDATE SET
           email      = EXCLUDED.email,
           full_name  = EXCLUDED.full_name,
           avatar_url = EXCLUDED.avatar_url,
           updated_at = NOW()
         RETURNING id, email, full_name, avatar_url`,
        [googleUser.sub, googleUser.email, googleUser.name, googleUser.picture]
      );

      // Ensure CUSTOMER role (idempotent)
      await client.query(
        `INSERT INTO user_roles (user_id, role)
         VALUES ($1, 'CUSTOMER')
         ON CONFLICT (user_id, role) DO NOTHING`,
        [user.id]
      );

      // Fetch all roles for this user
      const { rows: roleRows } = await client.query<{ role: string }>(
        'SELECT role FROM user_roles WHERE user_id = $1',
        [user.id]
      );
      const roles = roleRows.map(r => r.role);

      // Fetch maid profile status if applicable
      let maidStatus: string | undefined;
      let maidProfileId: string | undefined;
      if (roles.includes('MAID')) {
        const { rows: [maid] } = await client.query<{ id: string; status: string }>(
          'SELECT id, status FROM maid_profiles WHERE user_id = $1',
          [user.id]
        );
        if (maid) {
          maidStatus = maid.status;
          maidProfileId = maid.id;
        }
      }

      await client.query('COMMIT');

      // 4. Issue application JWT
      const accessToken = signToken({
        sub:           user.id,
        email:         user.email,
        roles,
        maidStatus,
        maidProfileId,
      });

      // 5. Issue refresh token (30-day, single-use rotation)
      const refreshToken = randomBytes(32).toString('hex');
      await client.query(
        `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, NOW() + $3::interval)`,
        [user.id, refreshToken, `${REFRESH_TTL_DAYS} days`]
      );

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          data: {
            accessToken,
            refreshToken,
            user: {
              id:       user.id,
              email:    user.email,
              fullName: user.full_name,
              avatarUrl: user.avatar_url,
              roles,
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
    return toErrorResponse(err, origin);
  }
}
