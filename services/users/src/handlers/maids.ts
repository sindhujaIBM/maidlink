/**
 * GET /users/maids           — list approved maids (filter by postalCode FSA, available date)
 * GET /users/maids/{maidId}  — get single maid public profile
 */

import type { APIGatewayProxyEvent } from 'aws-lambda';
import { withAuth, ok, getPool, NotFoundError } from '@maidlink/shared';
import { getPhotoUrl } from '../lib/s3';

export const listHandler = withAuth(async (event: APIGatewayProxyEvent) => {
  const { postalCode, minRate, maxRate, page = '1', limit = '20' } =
    (event.queryStringParameters || {}) as Record<string, string>;

  const pool = getPool();
  const values: unknown[] = ['APPROVED'];
  const conditions: string[] = ["mp.status = $1"];
  let idx = 2;

  // Filter by Calgary FSA (first 3 chars of postal code)
  if (postalCode) {
    const fsa = postalCode.replace(/\s/g, '').substring(0, 3).toUpperCase();
    conditions.push(`$${idx}::text = ANY(mp.service_area_codes)`);
    values.push(fsa);
    idx++;
  }

  if (minRate) { conditions.push(`mp.hourly_rate >= $${idx++}`); values.push(Number(minRate)); }
  if (maxRate) { conditions.push(`mp.hourly_rate <= $${idx++}`); values.push(Number(maxRate)); }

  const offset = (Number(page) - 1) * Number(limit);
  values.push(Number(limit), offset);

  const sql = `
    SELECT
      mp.id,
      mp.bio,
      mp.hourly_rate,
      mp.service_area_codes,
      mp.years_experience,
      mp.photo_s3_key,
      mp.is_verified,
      mp.created_at,
      u.id        AS user_id,
      u.full_name AS full_name,
      u.avatar_url,
      COALESCE(r.avg_rating, 0)::numeric  AS avg_rating,
      COALESCE(r.review_count, 0)::int    AS review_count
    FROM maid_profiles mp
    JOIN users u ON u.id = mp.user_id
    LEFT JOIN (
      SELECT maid_id,
             ROUND(AVG(rating), 1) AS avg_rating,
             COUNT(*)::int          AS review_count
      FROM reviews
      GROUP BY maid_id
    ) r ON r.maid_id = mp.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY mp.created_at DESC
    LIMIT $${idx++} OFFSET $${idx++}
  `;

  const { rows } = await pool.query(sql, values);

  // Attach pre-signed photo URLs (1h TTL) in parallel
  const maids = await Promise.all(
    rows.map(async (row: Record<string, unknown>) => ({
      id:               row.id,
      bio:              row.bio,
      hourlyRate:       row.hourly_rate,
      serviceAreaCodes: row.service_area_codes,
      yearsExperience:  row.years_experience,
      isVerified:       row.is_verified,
      avgRating:        row.avg_rating,
      reviewCount:      row.review_count,
      photoUrl:         await getPhotoUrl(row.photo_s3_key as string | null),
      createdAt:        row.created_at,
      user: {
        id:       row.user_id,
        fullName: row.full_name,
        avatarUrl: row.avatar_url,
      },
    }))
  );

  return ok(maids);
});

export const getOneHandler = withAuth(async (event: APIGatewayProxyEvent) => {
  const maidId = event.pathParameters?.maidId;
  if (!maidId) throw new NotFoundError('maidId is required');

  const pool = getPool();
  const { rows: [row] } = await pool.query(
    `SELECT
       mp.*,
       u.id        AS user_id,
       u.full_name AS full_name,
       u.email,
       u.avatar_url,
       COALESCE(r.avg_rating, 0)::numeric  AS avg_rating,
       COALESCE(r.review_count, 0)::int    AS review_count
     FROM maid_profiles mp
     JOIN users u ON u.id = mp.user_id
     LEFT JOIN (
       SELECT maid_id,
              ROUND(AVG(rating), 1) AS avg_rating,
              COUNT(*)::int          AS review_count
       FROM reviews
       GROUP BY maid_id
     ) r ON r.maid_id = mp.id
     WHERE mp.id = $1 AND mp.status = 'APPROVED'`,
    [maidId]
  );

  if (!row) throw new NotFoundError('Maid not found');

  // Also fetch recurring availability for display on profile page
  const { rows: recurring } = await pool.query(
    `SELECT id, day_of_week, start_time, end_time
     FROM availability_recurring WHERE maid_id = $1
     ORDER BY day_of_week`,
    [maidId]
  );

  const photoUrl = await getPhotoUrl(row.photo_s3_key);

  return ok({
    id:               row.id,
    bio:              row.bio,
    hourlyRate:       row.hourly_rate,
    serviceAreaCodes: row.service_area_codes,
    yearsExperience:  row.years_experience,
    isVerified:       row.is_verified,
    avgRating:        row.avg_rating,
    reviewCount:      row.review_count,
    photoUrl,
    createdAt:        row.created_at,
    user: {
      id:       row.user_id,
      fullName: row.full_name,
      email:    row.email,
      avatarUrl: row.avatar_url,
    },
    recurringAvailability: recurring.map((r: Record<string, unknown>) => ({
      id:         r.id,
      dayOfWeek:  r.day_of_week,
      startTime:  r.start_time,
      endTime:    r.end_time,
    })),
  });
});
