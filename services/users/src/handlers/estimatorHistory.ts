/**
 * GET /users/me/estimator/history
 *
 * Returns the current user's last 20 estimator analyses (newest first).
 * Only rows where result IS NOT NULL are returned (failed/rate-limit rows excluded).
 * Photo presigned GET URLs are generated for each stored S3 key (1-hour TTL).
 */

import type { APIGatewayProxyEvent } from 'aws-lambda';
import { withAuth, ok, getPool } from '@maidlink/shared';
import { getPhotoUrl } from '../lib/s3';

export const handler = withAuth(async (_event: APIGatewayProxyEvent, auth) => {
  const pool = getPool();

  const { rows } = await pool.query(
    `SELECT id, created_at, home_details, photo_s3_keys, result
     FROM estimator_analyses
     WHERE user_id = $1 AND result IS NOT NULL
     ORDER BY created_at DESC
     LIMIT 20`,
    [auth.userId]
  );

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
        photoUrls:   photoUrls.filter(Boolean) as string[],
      };
    })
  );

  return ok({ items });
});
