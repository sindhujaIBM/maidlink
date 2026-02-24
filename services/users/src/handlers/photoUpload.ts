/**
 * GET /users/me/photo-upload-url
 *
 * Returns a pre-signed S3 PUT URL valid for 1 hour.
 * The frontend uploads the JPEG directly to S3, then saves the s3Key
 * back to the maid profile via PUT /users/me/maid-profile.
 */

import type { APIGatewayProxyEvent } from 'aws-lambda';
import { withAuth, ok } from '@maidlink/shared';
import { getPhotoUploadUrl } from '../lib/s3';

export const handler = withAuth(async (_event: APIGatewayProxyEvent, auth) => {
  const { uploadUrl, s3Key } = await getPhotoUploadUrl(auth.userId);
  return ok({ uploadUrl, s3Key });
});
