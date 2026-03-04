/**
 * GET /users/me/id-doc-upload-url
 *
 * Returns a pre-signed S3 PUT URL (1 hour TTL) for uploading a government ID document.
 * The frontend uploads directly to S3, then saves the s3Key via PUT /users/me/maid-profile.
 * The admin can view it via GET /admin/maids/:maidId/id-doc-url (generates a GET pre-signed URL).
 */

import type { APIGatewayProxyEvent } from 'aws-lambda';
import { withAuth, ok } from '@maidlink/shared';
import { getIdDocUploadUrl } from '../lib/s3';

export const handler = withAuth(async (_event: APIGatewayProxyEvent, auth) => {
  const { uploadUrl, s3Key } = await getIdDocUploadUrl(auth.userId);
  return ok({ uploadUrl, s3Key });
});
