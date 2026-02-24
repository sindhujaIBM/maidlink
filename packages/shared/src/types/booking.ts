export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';

export interface Booking {
  id: string;
  customerId: string;
  maidId: string;
  status: BookingStatus;
  during: string;              // PostgreSQL tstzrange as string: '[start,end)'
  startAt: string;             // Parsed from during — ISO 8601
  endAt: string;               // Parsed from during — ISO 8601
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  postalCode: string;
  notes: string | null;
  totalPrice: string;          // NUMERIC as string
  createdAt: string;
  updatedAt: string;
}

export interface CreateBookingInput {
  maidId: string;
  startAt: string;             // ISO 8601
  endAt: string;               // ISO 8601
  addressLine1: string;
  addressLine2?: string;
  postalCode: string;
  notes?: string;
}
