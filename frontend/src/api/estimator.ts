import { usersClient } from './client';

export async function getEstimatorPhotoUploadUrl() {
  const res = await usersClient.get('/users/me/estimator-photo-upload-url');
  return res.data.data as { uploadUrl: string; s3Key: string };
}

/** Uploads an image directly to S3 via pre-signed PUT URL. */
export async function uploadEstimatorPhotoToS3(uploadUrl: string, file: File) {
  const res = await fetch(uploadUrl, {
    method:  'PUT',
    headers: { 'Content-Type': file.type || 'image/jpeg' },
    body:    file,
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

export interface EstimatorAnalysisResult {
  overallCondition:    'pristine' | 'average' | 'messy' | 'very_messy';
  matchesSelfReport:   boolean;
  conditionAssessment: string;
  roomBreakdown:       RoomBreakdown[];
  oneCleanerHours:     number;
  twoCleanerHours:     number;
  cleaningTypeNote?:   string;
  generatedChecklist:  RoomChecklist[];
  coverageWarnings?:   CoverageWarning[];
  confidenceNote?:     string;
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
