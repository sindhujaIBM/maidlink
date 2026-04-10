import { usersClient } from './client';

export async function getEstimatorPhotoUploadUrl() {
  const res = await usersClient.get('/users/me/estimator-photo-upload-url');
  return res.data.data as { uploadUrl: string; s3Key: string };
}

/** Resizes an image to at most maxPx on its longest side, returning a JPEG Blob. */
async function compressImage(file: File, maxPx = 1024): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  const scale  = Math.min(1, maxPx / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width  = Math.round(width  * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('Image compression failed')), 'image/jpeg', 0.85)
  );
}

/** Compresses then uploads an image directly to S3 via pre-signed PUT URL. */
export async function uploadEstimatorPhotoToS3(uploadUrl: string, file: File) {
  const blob = await compressImage(file);
  const res  = await fetch(uploadUrl, {
    method:  'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body:    blob,
  });
  if (!res.ok) throw new Error(`Photo upload failed (${res.status})`);
}

// ── Response types ────────────────────────────────────────────────────────────

export interface ChecklistTask {
  task:      string;
  priority:  'high' | 'medium' | 'standard';
  aiNote?:   string;  // e.g. "Heavy grease residue visible on stovetop"
}

export interface RoomChecklist {
  room:  string;
  tasks: ChecklistTask[];
}

export interface RoomBreakdown {
  room:             string;
  condition:        'pristine' | 'average' | 'messy' | 'very_messy';
  estimatedMinutes: number;
  notes:            string;
  priorityTasks:    string[];
}

export interface CoverageWarning {
  room:    string;
  missing: string;
}

export interface UpgradeRecommendation {
  suggestedType: string;
  reason:        string;
  benefits:      string[];
}

export interface EstimatorAnalysisResult {
  overallCondition:      'pristine' | 'average' | 'messy' | 'very_messy';
  matchesSelfReport:     boolean;
  conditionAssessment:   string;
  roomBreakdown:         RoomBreakdown[];
  oneCleanerHours:       number;
  twoCleanerHours:       number;
  upgradeRecommendation?: UpgradeRecommendation;
  generatedChecklist:    RoomChecklist[];
  coverageWarnings?:     CoverageWarning[];
  confidenceNote?:       string;
}

// ── History ───────────────────────────────────────────────────────────────────

export interface EstimatorHistoryItem {
  id:          string;
  createdAt:   string;
  homeDetails: {
    bedrooms:     number;
    bathrooms:    number;
    sqftRange:    string;
    condition:    string;
    extras:       string[];
    cleaningType: string;
    pets:         boolean;
    cookingFreq:  string;
    cookingStyle: string;
    rooms:        Array<{ room: string; photoCount: number }>;
  };
  result:    EstimatorAnalysisResult;
  photoUrls: string[];
  adminFeedback?: {
    adjustedHours?: number;
    note:           string;
    reviewedBy:     string;
    reviewedAt:     string;
    notifyCustomer: boolean;
  } | null;
}

export async function getEstimatorHistory(): Promise<EstimatorHistoryItem[]> {
  const res = await usersClient.get('/users/me/estimator/history');
  return res.data.data.items as EstimatorHistoryItem[];
}

// ── API call ──────────────────────────────────────────────────────────────────

export async function analyzeEstimatorPhotos(data: {
  bedrooms:     number;
  bathrooms:    number;
  sqftRange:    string;
  condition:    string;
  extras:       string[];
  cleaningType: string;
  pets:         boolean;
  cookingFreq:  string;
  cookingStyle: string;
  rooms:        Array<{ room: string; photoS3Keys: string[] }>;
}) {
  const res = await usersClient.post('/users/me/estimator/analyze', data);
  return res.data.data.analysis as EstimatorAnalysisResult;
}
