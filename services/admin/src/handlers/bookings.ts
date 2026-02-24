/**
 * GET /admin/bookings — paginated list of all bookings
 */

import type { APIGatewayProxyEvent } from 'aws-lambda';
import { withAuth, ok, getPool } from '@maidlink/shared';

export const listHandler = withAuth(async (event: APIGatewayProxyEvent) => {
  const { status, page = '1', limit = '50' } =
    (event.queryStringParameters || {}) as Record<string, string>;

  const pool = getPool();
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (status) { conditions.push(`b.status = $${idx++}`); values.push(status.toUpperCase()); }

  const offset = (Number(page) - 1) * Number(limit);
  values.push(Number(limit), offset);

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT
       b.id, b.status, b.total_price, b.postal_code, b.created_at,
       lower(b.during) AS start_at,
       upper(b.during) AS end_at,
       cu.full_name AS customer_name,
       cu.email     AS customer_email,
       mu.full_name AS maid_name,
       mu.email     AS maid_email
     FROM bookings b
     JOIN users cu ON cu.id = b.customer_id
     JOIN maid_profiles mp ON mp.id = b.maid_id
     JOIN users mu ON mu.id = mp.user_id
     ${where}
     ORDER BY lower(b.during) DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    values
  );

  const formatted = rows.map(r => ({
    id:            r.id,
    status:        r.status,
    totalPrice:    r.total_price,
    postalCode:    r.postal_code,
    createdAt:     r.created_at,
    startAt:       r.start_at,
    endAt:         r.end_at,
    customerName:  r.customer_name,
    customerEmail: r.customer_email,
    maidName:      r.maid_name,
    maidEmail:     r.maid_email,
  }));

  return ok(formatted);
}, ['ADMIN']);
