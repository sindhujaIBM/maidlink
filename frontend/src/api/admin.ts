import { adminClient } from './client';

export async function listAdminMaids(params?: { status?: string; page?: number }) {
  const res = await adminClient.get('/admin/maids', { params });
  return res.data.data as {
    maids: AdminMaid[];
    total: number;
    page: number;
    limit: number;
  };
}

export async function approveMaid(maidId: string) {
  const res = await adminClient.post(`/admin/maids/${maidId}/approve`);
  return res.data.data;
}

export async function rejectMaid(maidId: string, reason: string) {
  const res = await adminClient.post(`/admin/maids/${maidId}/reject`, { reason });
  return res.data.data;
}

export async function verifyMaid(maidId: string) {
  const res = await adminClient.post(`/admin/maids/${maidId}/verify`);
  return res.data.data;
}

export async function unverifyMaid(maidId: string) {
  const res = await adminClient.post(`/admin/maids/${maidId}/unverify`);
  return res.data.data;
}

export async function getAdminIdDocUrl(maidId: string) {
  const res = await adminClient.get(`/admin/maids/${maidId}/id-doc-url`);
  return res.data.data as { url: string };
}

export async function listAdminBookings(params?: { status?: string; page?: number }) {
  const res = await adminClient.get('/admin/bookings', { params });
  return res.data.data as AdminBooking[];
}

export async function listAdminUsers(params?: { page?: number }) {
  const res = await adminClient.get('/admin/users', { params });
  return res.data.data as AdminUser[];
}

export async function listMaidApplications(params?: { status?: string }) {
  const res = await adminClient.get('/admin/maid-applications', { params });
  return res.data.data as MaidApplication[];
}

export async function approveMaidApplication(id: string) {
  const res = await adminClient.post(`/admin/maid-applications/${id}/approve`);
  return res.data.data;
}

export async function rejectMaidApplication(id: string, notes?: string) {
  const res = await adminClient.post(`/admin/maid-applications/${id}/reject`, { notes });
  return res.data.data;
}

export async function getApplicationIdDocUrl(id: string) {
  const res = await adminClient.get(`/admin/maid-applications/${id}/id-doc-url`);
  return res.data.data as { url: string };
}

export interface AdminMaid {
  id: string;
  status: string;
  bio: string | null;
  hourlyRate: string;
  serviceAreaCodes: string[];
  yearsExperience: number;
  rejectedReason: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  isVerified: boolean;
  hasIdDoc: boolean;
  photoUrl: string | null;
  verifiedAt: string | null;
  createdAt: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    avatarUrl: string | null;
    createdAt: string;
  };
}

export interface AdminBooking {
  id: string;
  status: string;
  totalPrice: string;
  postalCode: string;
  startAt: string;
  endAt: string;
  createdAt: string;
  customerName: string;
  customerEmail: string;
  maidName: string;
  maidEmail: string;
}

export interface MaidApplication {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  gender: string;
  age: number;
  workEligibility: string;
  yearsExperience: number;
  bio: string | null;
  hourlyRatePref: string | null;
  hasOwnSupplies: boolean;
  canDrive: boolean;
  offersCooking: boolean;
  languages: string[];
  availability: string;
  referralSource: string | null;
  hasPhoto: boolean;
  photoUrl: string | null;
  hasIdDoc: boolean;
  status: string;
  notes: string | null;
  createdAt: string;
}

export interface AdminFeedback {
  adjustedHours?: number;
  note:           string;
  reviewedBy:     string;
  reviewedAt:     string;
  notifyCustomer: boolean;
}

export interface AdminEstimatorAnalysis {
  id:            string;
  createdAt:     string;
  adminFeedback?: AdminFeedback;
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
  result: {
    overallCondition:    string;
    conditionAssessment: string;
    oneCleanerHours:     number;
    twoCleanerHours:     number;
    upgradeRecommendation?: { suggestedType: string; reason: string; benefits: string[] };
    roomBreakdown:          Array<{ room: string; condition: string; estimatedMinutes: number; notes: string }>;
    generatedChecklist:     Array<{ room: string; tasks: Array<{ task: string; priority: string; aiNote?: string }> }>;
    coverageWarnings?:      Array<{ room: string; missing: string }>;
    confidenceNote?:        string;
  };
  photoUrls: string[];
  user: {
    id:        string;
    name:      string;
    email:     string;
    avatarUrl: string | null;
  };
}

export async function listAdminEstimatorAnalyses(params?: { page?: number; limit?: number }) {
  const res = await adminClient.get('/admin/estimator/analyses', { params });
  return res.data.data as { items: AdminEstimatorAnalysis[]; total: number; page: number; limit: number };
}

export async function saveEstimatorFeedback(
  id: string,
  data: { adjustedHours?: number; note: string; notifyCustomer: boolean },
) {
  const res = await adminClient.patch(`/admin/estimator/analyses/${id}/feedback`, data);
  return res.data.data as { success: boolean };
}

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  createdAt: string;
  roles: string[];
}
