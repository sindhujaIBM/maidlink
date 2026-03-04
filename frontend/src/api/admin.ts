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

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  createdAt: string;
  roles: string[];
}
