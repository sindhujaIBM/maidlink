import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

// Singleton S3 client — reused across Lambda warm invocations
const s3 = new S3Client({
  region: process.env.AWS_REGION || 'ca-west-1',
});

const BUCKET = process.env.PHOTOS_BUCKET!;
const PHOTO_SIZE_LIMIT_BYTES  = 5 * 1024 * 1024; // 5 MB
const ID_DOC_SIZE_LIMIT_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Generates a pre-signed PUT URL for uploading a profile photo.
 * The frontend uploads directly to S3 — the photo never transits through Lambda.
 */
export async function getPhotoUploadUrl(userId: string): Promise<{ uploadUrl: string; s3Key: string }> {
  const s3Key = `profile-photos/${userId}/${Date.now()}-${randomUUID()}.jpg`;

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket:        BUCKET,
      Key:           s3Key,
      ContentType:   'image/jpeg',
      // Enforce max size on pre-signed URL (supported by S3 signature)
      ContentLength: PHOTO_SIZE_LIMIT_BYTES,
    }),
    { expiresIn: 3600 } // 1 hour
  );

  return { uploadUrl, s3Key };
}

/**
 * Generates a pre-signed PUT URL for uploading a government ID document.
 * Stored under id-docs/ prefix in the same bucket as photos.
 */
export async function getIdDocUploadUrl(userId: string): Promise<{ uploadUrl: string; s3Key: string }> {
  const s3Key = `id-docs/${userId}/${Date.now()}-${randomUUID()}`;

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket:        BUCKET,
      Key:           s3Key,
      ContentLength: ID_DOC_SIZE_LIMIT_BYTES,
    }),
    { expiresIn: 3600 } // 1 hour
  );

  return { uploadUrl, s3Key };
}

/**
 * Generates a pre-signed GET URL for serving a profile photo.
 * 1-hour TTL. Returns null if s3Key is null/undefined.
 */
export async function getPhotoUrl(s3Key: string | null | undefined): Promise<string | null> {
  if (!s3Key) return null;

  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }),
    { expiresIn: 3600 }
  );
}
