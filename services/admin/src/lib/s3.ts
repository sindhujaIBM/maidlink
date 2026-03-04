import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'ca-west-1',
});

const BUCKET = process.env.PHOTOS_BUCKET!;

/**
 * Generates a short-lived pre-signed GET URL for viewing an ID document.
 * 15-minute TTL — admin use only, never exposed to the maid or customer.
 */
export async function getIdDocViewUrl(s3Key: string): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }),
    { expiresIn: 900 } // 15 minutes
  );
}
