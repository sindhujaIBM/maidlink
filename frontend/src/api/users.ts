import { usersClient } from './client';

// ── Maid listing (public) ────────────────────────────────────────────────────

export async function listMaids(params?: {
  postalCode?: string;
  minRate?: number;
  maxRate?: number;
  page?: number;
}) {
  const res = await usersClient.get('/users/maids', { params });
  return res.data.data as MaidListItem[];
}

export async function getMaid(maidId: string) {
  const res = await usersClient.get(`/users/maids/${maidId}`);
  return res.data.data as MaidDetail;
}

// ── Own profile ──────────────────────────────────────────────────────────────

export async function getMyProfile() {
  const res = await usersClient.get('/users/me');
  return res.data.data;
}

export async function updateMyProfile(data: { fullName?: string; phone?: string }) {
  const res = await usersClient.put('/users/me', data);
  return res.data.data;
}

// ── Maid profile (own) ───────────────────────────────────────────────────────

export async function getMyMaidProfile() {
  const res = await usersClient.get('/users/me/maid-profile');
  return res.data.data;
}

export async function createMaidProfile(data: {
  bio?: string;
  hourlyRate: number;
  serviceAreaCodes: string[];
  yearsExperience?: number;
}) {
  const res = await usersClient.post('/users/me/maid-profile', data);
  return res.data.data;
}

export async function updateMaidProfile(data: {
  bio?: string;
  hourlyRate?: number;
  serviceAreaCodes?: string[];
  yearsExperience?: number;
  photoS3Key?: string;
}) {
  const res = await usersClient.put('/users/me/maid-profile', data);
  return res.data.data;
}

// ── Photo upload ─────────────────────────────────────────────────────────────

export async function getPhotoUploadUrl() {
  const res = await usersClient.get('/users/me/photo-upload-url');
  return res.data.data as { uploadUrl: string; s3Key: string };
}

/** Uploads a JPEG file directly to S3 via a pre-signed PUT URL. */
export async function uploadPhotoToS3(uploadUrl: string, file: File) {
  await fetch(uploadUrl, {
    method:  'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body:    file,
  });
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface MaidListItem {
  id: string;
  bio: string | null;
  hourlyRate: string;
  serviceAreaCodes: string[];
  yearsExperience: number;
  photoUrl: string | null;
  createdAt: string;
  user: { id: string; fullName: string; avatarUrl: string | null };
}

export interface MaidDetail extends MaidListItem {
  user: MaidListItem['user'] & { email: string };
  recurringAvailability: Array<{
    id: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
  }>;
}
