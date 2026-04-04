/**
 * GET /admin/users — paginated list of all users with their roles
 */

import type { APIGatewayProxyEvent } from 'aws-lambda';
import { withAuth, ok, getPool } from '@maidlink/shared';

export const listHandler = withAuth(async (event: APIGatewayProxyEvent) => {
  const { page = '1', limit = '50' } =
    (event.queryStringParameters || {}) as Record<string, string>;

  const pool = getPool();
  const offset = (Number(page) - 1) * Number(limit);

  const { rows } = await pool.query(
    `SELECT
       u.id, u.email, u.full_name, u.avatar_url, u.created_at,
       array_remove(array_agg(ur.role ORDER BY ur.role), NULL) AS roles
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     GROUP BY u.id
     ORDER BY u.created_at DESC
     LIMIT $1 OFFSET $2`,
    [Number(limit), offset]
  );

  return ok(rows.map((r: Record<string, unknown>) => ({
    id:        r.id,
    email:     r.email,
    fullName:  r.full_name,
    avatarUrl: r.avatar_url,
    createdAt: r.created_at,
    roles:     r.roles,
  })));
}, ['ADMIN']);
