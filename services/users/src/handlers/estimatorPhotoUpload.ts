/**
 * GET /users/me/estimator-photo-upload-url
 *
 * Returns a pre-signed S3 PUT URL for uploading an estimator room photo.
 * Photos are stored temporarily under estimator-photos/ — they are never
 * persisted to the database and can be cleaned up via S3 lifecycle rules.
 */

import type { APIGatewayProxyEvent } from 'aws-lambda';
import { withAuth, ok } from '@maidlink/shared';
import { getEstimatorPhotoUploadUrl } from '../lib/s3';

export const handler = withAuth(async (_event: APIGatewayProxyEvent, auth) => {
  const { uploadUrl, s3Key } = await getEstimatorPhotoUploadUrl(auth.userId);
  return ok({ uploadUrl, s3Key });
});
