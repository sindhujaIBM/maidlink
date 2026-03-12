import { bookingClient } from './client';

// ── Bookings ─────────────────────────────────────────────────────────────────

export async function createBooking(data: {
  maidId:           string;
  startAt:          string;
  endAt:            string;
  addressLine1:     string;
  addressLine2?:    string;
  postalCode:       string;
  notes?:           string;
  beforePhotoKeys?: string[];
}) {
  const res = await bookingClient.post('/bookings', data);
  return res.data.data as Booking;
}

export async function getAfterPhotoUploadUrl(bookingId: string) {
  const res = await bookingClient.get(`/bookings/${bookingId}/after-photos/upload-url`);
  return res.data.data as { uploadUrl: string; s3Key: string };
}

export async function submitAfterPhotos(bookingId: string, s3Keys: string[]) {
  const res = await bookingClient.patch(`/bookings/${bookingId}/after-photos`, { s3Keys });
  return res.data.data as { uploaded: number };
}

export async function listBookings(params?: { role?: 'customer' | 'maid'; status?: string }) {
  const res = await bookingClient.get('/bookings', { params });
  return res.data.data as Booking[];
}

export async function getBooking(id: string) {
  const res = await bookingClient.get(`/bookings/${id}`);
  return res.data.data as Booking;
}

export async function cancelBooking(id: string) {
  await bookingClient.delete(`/bookings/${id}`);
}

export async function completeBooking(id: string) {
  const res = await bookingClient.patch(`/bookings/${id}/complete`);
  return res.data.data as Booking;
}

export async function createReview(bookingId: string, data: { rating: number; comment?: string }) {
  const res = await bookingClient.post(`/bookings/${bookingId}/review`, data);
  return res.data.data as Review;
}

export async function getMaidReviews(maidId: string, params?: { page?: number; limit?: number }) {
  const res = await bookingClient.get(`/reviews/maids/${maidId}`, { params });
  return res.data.data as { reviews: Review[]; total: number; page: number; limit: number };
}

export async function getEarnings() {
  const res = await bookingClient.get('/bookings/earnings');
  return res.data.data as EarningsSummary;
}

// ── Availability ─────────────────────────────────────────────────────────────

export async function getMaidSlots(maidId: string, fromDate: string, toDate: string) {
  const res = await bookingClient.get(`/bookings/maids/${maidId}/slots`, {
    params: { fromDate, toDate },
  });
  return res.data.data as Array<{ date: string; startAt: string; endAt: string }>;
}

export async function listMyAvailability() {
  const res = await bookingClient.get('/availabilities');
  return res.data.data as {
    recurring: RecurringSlot[];
    overrides: AvailabilityOverride[];
  };
}

export async function createRecurringSlot(data: {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
}) {
  const res = await bookingClient.post('/availabilities/recurring', data);
  return res.data.data as RecurringSlot;
}

export async function deleteRecurringSlot(id: string) {
  await bookingClient.delete(`/availabilities/recurring/${id}`);
}

export async function createOverride(data: {
  overrideDate: string;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}) {
  const res = await bookingClient.post('/availabilities/overrides', data);
  return res.data.data as AvailabilityOverride;
}

export async function deleteOverride(id: string) {
  await bookingClient.delete(`/availabilities/overrides/${id}`);
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface Booking {
  id: string;
  customerId: string;
  maidId: string;
  status: string;
  startAt: string;
  endAt: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  postalCode: string;
  notes: string | null;
  totalPrice: string;
  createdAt: string;
  customerName?: string;
  maidName?: string;
  beforePhotoKeys?: string[];
  afterPhotoKeys?: string[];
  beforePhotoUrls?: string[];
  afterPhotoUrls?: string[];
}

export interface Review {
  id: string;
  bookingId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  customerName?: string;
  customerAvatar?: string | null;
}

export interface EarningsSummary {
  summary: {
    totalEarned: string;
    thisMonthEarned: string;
    pendingEarnings: string;
    completedCount: number;
    upcomingCount: number;
  };
  completedBookings: Array<{
    id: string;
    startAt: string;
    endAt: string;
    totalPrice: string;
    customerName: string;
    createdAt: string;
  }>;
  upcomingBookings: Array<{
    id: string;
    startAt: string;
    endAt: string;
    totalPrice: string;
    customerName: string;
  }>;
}

export interface RecurringSlot {
  id: string;
  maidId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
}

export interface AvailabilityOverride {
  id: string;
  maidId: string;
  overrideDate: string;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}
