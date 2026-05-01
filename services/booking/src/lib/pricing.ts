/**
 * Calculates the total price for a booking.
 * Rounds to 2 decimal places.
 *
 * Uses integer arithmetic (cents) to avoid IEEE 754 floating-point precision
 * issues that can arise from multiplying decimals directly.
 * e.g. 2.5 hours * $12.30/hr = $30.75, not $30.749999999...
 */
export function calculateTotalPrice(startAt: Date, endAt: Date, hourlyRate: number): number {
  const durationMs = endAt.getTime() - startAt.getTime();
  const durationHours = durationMs / 3_600_000;

  // Work in integer cents to avoid float precision drift
  const rateCents = Math.round(hourlyRate * 100);
  const totalCents = Math.round(durationHours * rateCents);

  return totalCents / 100;
}
