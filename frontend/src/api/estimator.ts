import { usersClient } from './client';

export async function getEstimatorPhotoUploadUrl() {
  const res = await usersClient.get('/users/me/estimator-photo-upload-url');
  return res.data.data as { uploadUrl: string; s3Key: string };
}

/** Uploads a JPEG image directly to S3 via pre-signed PUT URL. */
export async function uploadEstimatorPhotoToS3(uploadUrl: string, file: File) {
  const res = await fetch(uploadUrl, {
    method:  'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body:    file,
  });
  if (!res.ok) throw new Error(`Photo upload failed (${res.status})`);
}

export interface EstimatorAnalysisResult {
  conditionAssessment: string;
  adjustedCondition:   'pristine' | 'average' | 'messy' | 'very_messy';
  matchesSelfReport:   boolean;
  cleaningTypeNote:    string;
  oneCleanerHours:     number;
  twoCleanerHours:     number;
  keyAreas:            string[];
  confidenceNote:      string;
}

export async function analyzeEstimatorPhotos(data: {
  bedrooms:     number;
  bathrooms:    number;
  sqftRange:    string;
  condition:    string;
  extras:       string[];
  photoS3Keys:  string[];
  cleaningType: string;
  pets:         boolean;
  cookingFreq:  string;
  cookingStyle: string;
}) {
  const res = await usersClient.post('/users/me/estimator/analyze', data);
  return res.data.data.analysis as EstimatorAnalysisResult;
}
