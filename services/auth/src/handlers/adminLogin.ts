/**
 * POST /auth/admin-login
 *
 * Email + password login for admin users.
 * Works in all environments (dev and production).
 *
 * Body: { email: string, password: string }
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import bcrypt from 'bcryptjs';
import { getPool, signToken, toErrorResponse, corsOrigin, ValidationError, UnauthorizedError } from '@maidlink/shared';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const origin = corsOrigin(event);
  const corsHeaders = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Content-Type': 'application/json' };
  try {
    if (!event.body) throw new ValidationError('Request body is required');
    const { email, password } = JSON.parse(event.body) as { email?: string; password?: string };
    if (!email)    throw new ValidationError('email is required');
    if (!password) throw new ValidationError('password is required');

    const pool = getPool();

    const { rows: [user] } = await pool.query(
      `SELECT u.id, u.email, u.full_name, u.avatar_url, u.password_hash
       FROM users u
       JOIN user_roles r ON r.user_id = u.id
       WHERE u.email = $1 AND r.role = 'ADMIN'`,
      [email.toLowerCase().trim()]
    );

    // Use a constant-time check even on "user not found" to prevent email enumeration
    const dummyHash = '$2a$10$abcdefghijklmnopqrstuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu';
    const hashToCheck = user?.password_hash ?? dummyHash;
    const valid = await bcrypt.compare(password, hashToCheck);

    if (!user || !valid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const { rows: roleRows } = await pool.query(
      'SELECT role FROM user_roles WHERE user_id = $1',
      [user.id]
    );
    const roles = roleRows.map((r: { role: string }) => r.role);

    const accessToken = signToken({
      sub:      user.id,
      email:    user.email,
      roles,
    });

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
          },
        },
      }),
    };
  } catch (err) {
    return toErrorResponse(err, origin);
  }
}
