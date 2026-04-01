/**
 * GET /admin/estimator/analyses
 *
 * Returns all estimator analyses across all users, newest first.
 * Includes user info (name, email) and presigned photo URLs.
 * Paginated: ?page=1&limit=20
 */

import type { APIGatewayProxyEvent } from 'aws-lambda';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { withAuth, ok, ForbiddenError, getPool } from '@maidlink/shared';

const s3     = new S3Client({ region: process.env.AWS_REGION || 'ca-west-1' });
const BUCKET = process.env.PHOTOS_BUCKET!;

async function getPhotoUrl(key: string): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: 3600 }
  );
}

export const handler = withAuth(async (event: APIGatewayProxyEvent, auth) => {
  if (!auth.roles.includes('ADMIN')) throw new ForbiddenError('Admins only');

  const page  = Math.max(1, parseInt(event.queryStringParameters?.page  ?? '1',  10));
  const limit = Math.min(50, parseInt(event.queryStringParameters?.limit ?? '20', 10));
  const offset = (page - 1) * limit;

  const pool = getPool();

  const [{ rows }, { rows: [{ total }] }] = await Promise.all([
    pool.query(
      `SELECT
         ea.id,
         ea.created_at,
         ea.home_details,
         ea.photo_s3_keys,
         ea.result,
         u.id          AS user_id,
         u.full_name   AS user_name,
         u.email       AS user_email,
         u.avatar_url  AS user_avatar
       FROM estimator_analyses ea
       JOIN users u ON u.id = ea.user_id
       WHERE ea.result IS NOT NULL
       ORDER BY ea.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total
       FROM estimator_analyses
       WHERE result IS NOT NULL`
    ),
  ]);

  const items = await Promise.all(
    rows.map(async row => {
      const photoUrls = await Promise.all(
        (row.photo_s3_keys as string[]).map(key => getPhotoUrl(key))
      );
      return {
        id:          row.id,
        createdAt:   row.created_at,
        homeDetails: row.home_details,
        result:      row.result,
        photoUrls,
        user: {
          id:        row.user_id,
          name:      row.user_name,
          email:     row.user_email,
          avatarUrl: row.user_avatar,
        },
      };
    })
  );

  return ok({ items, total, page, limit });
});
