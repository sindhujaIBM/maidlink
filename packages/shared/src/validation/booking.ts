import { ValidationError } from '../errors';

export const MIN_BOOKING_HOURS = 3;

/**
 * Asserts that the booking duration is at least MIN_BOOKING_HOURS.
 * Throws ValidationError if not.
 */
export function assertMinDuration(startAt: Date, endAt: Date): void {
  const hours = (endAt.getTime() - startAt.getTime()) / 3_600_000;
  if (hours < MIN_BOOKING_HOURS) {
    throw new ValidationError(`Minimum booking duration is ${MIN_BOOKING_HOURS} hours`);
  }
}

/** Asserts that the booking is in the future. */
export function assertFutureDate(startAt: Date): void {
  if (startAt <= new Date()) {
    throw new ValidationError('Booking start time must be in the future');
  }
}

/**
 * Asserts that start < end and neither is NaN.
 */
export function assertValidDateRange(startAt: Date, endAt: Date): void {
  if (isNaN(startAt.getTime())) throw new ValidationError('Invalid startAt date');
  if (isNaN(endAt.getTime()))   throw new ValidationError('Invalid endAt date');
  if (endAt <= startAt)         throw new ValidationError('endAt must be after startAt');
}
