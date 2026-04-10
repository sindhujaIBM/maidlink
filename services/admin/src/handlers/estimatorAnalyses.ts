/**
 * GET  /admin/estimator/analyses         — list all analyses (paginated)
 * PATCH /admin/estimator/analyses/:id/feedback — admin feedback + optional customer notification
 */

import type { APIGatewayProxyEvent } from 'aws-lambda';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { withAuth, ok, ForbiddenError, getPool } from '@maidlink/shared';

const s3     = new S3Client({ region: process.env.AWS_REGION || 'ca-west-1' });
const ses    = new SESClient({ region: 'us-east-1' });
const BUCKET = process.env.PHOTOS_BUCKET!;

async function getPhotoUrl(key: string): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: 3600 }
  );
}

export const listHandler = withAuth(async (event: APIGatewayProxyEvent, auth) => {
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
         ea.admin_feedback,
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
        id:            row.id,
        createdAt:     row.created_at,
        homeDetails:   row.home_details,
        result:        row.result,
        adminFeedback: row.admin_feedback ?? null,
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

export const feedbackHandler = withAuth(async (event: APIGatewayProxyEvent, auth) => {
  if (!auth.roles.includes('ADMIN')) throw new ForbiddenError('Admins only');

  const id = event.pathParameters?.id;
  if (!id) return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Missing analysis id' }) };

  const body = JSON.parse(event.body || '{}');
  const { adjustedHours, note, notifyCustomer = false } = body;

  if (!note || typeof note !== 'string' || note.trim().length === 0) {
    return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'note is required' }) };
  }

  const pool = getPool();

  // Fetch the analysis + customer email
  const { rows } = await pool.query(
    `SELECT ea.id, ea.result, u.email, u.full_name
     FROM estimator_analyses ea
     JOIN users u ON u.id = ea.user_id
     WHERE ea.id = $1 AND ea.result IS NOT NULL`,
    [id]
  );

  if (!rows.length) {
    return { statusCode: 404, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Analysis not found' }) };
  }

  const row = rows[0];
  const aiHours: number = row.result?.oneCleanerHours;

  const feedback = {
    adjustedHours: (adjustedHours != null && adjustedHours !== aiHours) ? Number(adjustedHours) : undefined,
    note:           note.trim(),
    reviewedBy:     auth.email,
    reviewedAt:     new Date().toISOString(),
    notifyCustomer: Boolean(notifyCustomer),
  };

  await pool.query(
    `UPDATE estimator_analyses SET admin_feedback = $1 WHERE id = $2`,
    [JSON.stringify(feedback), id]
  );

  // Optionally notify customer
  if (notifyCustomer && row.email) {
    const hoursLine = feedback.adjustedHours != null
      ? `<p>Our specialist reviewed your estimate and adjusted the time to <strong>${feedback.adjustedHours} hours</strong> (AI estimated ${aiHours} hrs).</p>`
      : `<p>Our specialist reviewed your estimate of <strong>${aiHours} hours</strong> and it looks accurate.</p>`;

    ses.send(new SendEmailCommand({
      Source:      'noreply@maidlink.ca',
      Destination: { ToAddresses: [row.email] },
      ...(process.env.SES_CONFIG_SET ? { ConfigurationSetName: process.env.SES_CONFIG_SET } : {}),
      Message: {
        Subject: { Data: 'Your MaidLink cleaning estimate has been reviewed' },
        Body: {
          Html: {
            Data: `
              <p>Hi ${row.full_name ?? 'there'},</p>
              ${hoursLine}
              <p><strong>Specialist note:</strong> ${feedback.note}</p>
              <p>You can view your estimate and book a cleaner at <a href="https://maidlink.ca/estimate/history">maidlink.ca/estimate/history</a>.</p>
              <p>— The MaidLink Team</p>
            `,
          },
        },
      },
    })).catch(err => console.error('Feedback notify email failed:', err));
  }

  return ok({ success: true });
});
