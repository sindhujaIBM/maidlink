/**
 * Calculates the total price for a booking.
 * Rounds to 2 decimal places.
 */
export function calculateTotalPrice(startAt: Date, endAt: Date, hourlyRate: number): number {
  const hours = (endAt.getTime() - startAt.getTime()) / 3_600_000;
  return Math.round(hours * hourlyRate * 100) / 100;
}
