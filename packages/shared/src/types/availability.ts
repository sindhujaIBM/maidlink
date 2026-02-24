export type DayOfWeek = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export interface RecurringSlot {
  id: string;
  maidId: string;
  dayOfWeek: DayOfWeek;
  startTime: string;   // 'HH:MM'
  endTime: string;     // 'HH:MM'
  createdAt: string;
}

export interface AvailabilityOverride {
  id: string;
  maidId: string;
  overrideDate: string;  // 'YYYY-MM-DD'
  startTime: string;     // 'HH:MM'
  endTime: string;       // 'HH:MM'
  isAvailable: boolean;
  createdAt: string;
}

// A resolved, bookable time slot (computed from recurring + overrides - bookings)
export interface AvailableSlot {
  date: string;          // 'YYYY-MM-DD'
  startAt: string;       // ISO 8601 datetime
  endAt: string;         // ISO 8601 datetime
}
