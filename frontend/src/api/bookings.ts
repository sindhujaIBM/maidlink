import { bookingClient } from './client';

// ── Bookings ─────────────────────────────────────────────────────────────────

export async function createBooking(data: {
  maidId: string;
  startAt: string;
  endAt: string;
  addressLine1: string;
  addressLine2?: string;
  postalCode: string;
  notes?: string;
}) {
  const res = await bookingClient.post('/bookings', data);
  return res.data.data as Booking;
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
