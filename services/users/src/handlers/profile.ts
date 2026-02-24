/**
 * GET  /users/me  — return current user profile
 * PUT  /users/me  — update name / phone
 */

import type { APIGatewayProxyEvent } from 'aws-lambda';
import { withAuth, ok, getPool, ValidationError } from '@maidlink/shared';

export const getHandler = withAuth(async (_event: APIGatewayProxyEvent, auth) => {
  const pool = getPool();
  const { rows: [user] } = await pool.query(
    `SELECT id, email, full_name, avatar_url, phone, created_at, updated_at
     FROM users WHERE id = $1`,
    [auth.userId]
  );

  const { rows: roleRows } = await pool.query(
    'SELECT role FROM user_roles WHERE user_id = $1',
    [auth.userId]
  );

  return ok({
    id:        user.id,
    email:     user.email,
    fullName:  user.full_name,
    avatarUrl: user.avatar_url,
    phone:     user.phone,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    roles:     roleRows.map((r: { role: string }) => r.role),
  });
});

export const updateHandler = withAuth(async (event: APIGatewayProxyEvent, auth) => {
  if (!event.body) throw new ValidationError('Request body is required');
  const body = JSON.parse(event.body) as { fullName?: string; phone?: string };

  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (body.fullName !== undefined) {
    if (!body.fullName.trim()) throw new ValidationError('fullName cannot be empty');
    fields.push(`full_name = $${idx++}`);
    values.push(body.fullName.trim());
  }
  if (body.phone !== undefined) {
    fields.push(`phone = $${idx++}`);
    values.push(body.phone || null);
  }

  if (fields.length === 0) throw new ValidationError('No fields to update');

  values.push(auth.userId);
  const { rows: [user] } = await getPool().query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, email, full_name, avatar_url, phone`,
    values
  );

  return ok({
    id: user.id, email: user.email, fullName: user.full_name,
    avatarUrl: user.avatar_url, phone: user.phone,
  });
});
