import { describe, it, expect } from 'vitest';
import { calculateTotalPrice } from '../lib/pricing';

describe('calculateTotalPrice', () => {
  it('calculates 3 hours at $40/hr', () => {
    const start = new Date('2030-01-01T10:00:00Z');
    const end   = new Date('2030-01-01T13:00:00Z');
    expect(calculateTotalPrice(start, end, 40)).toBe(120);
  });

  it('calculates 5 hours at $35/hr', () => {
    const start = new Date('2030-01-01T09:00:00Z');
    const end   = new Date('2030-01-01T14:00:00Z');
    expect(calculateTotalPrice(start, end, 35)).toBe(175);
  });

  it('handles fractional hours (1.5h at $40/hr)', () => {
    const start = new Date('2030-01-01T10:00:00Z');
    const end   = new Date('2030-01-01T11:30:00Z');
    expect(calculateTotalPrice(start, end, 40)).toBe(60);
  });

  it('rounds to 2 decimal places', () => {
    const start = new Date('2030-01-01T10:00:00Z');
    const end   = new Date('2030-01-01T11:00:00Z'); // 1 hour
    expect(calculateTotalPrice(start, end, 33.33)).toBe(33.33);
  });

  it('returns 0 for zero-length booking', () => {
    const d = new Date('2030-01-01T10:00:00Z');
    expect(calculateTotalPrice(d, d, 50)).toBe(0);
  });

  it('works with different hourly rates', () => {
    const start = new Date('2030-06-01T08:00:00Z');
    const end   = new Date('2030-06-01T12:00:00Z'); // 4 hours
    expect(calculateTotalPrice(start, end, 25)).toBe(100);
    expect(calculateTotalPrice(start, end, 50)).toBe(200);
    expect(calculateTotalPrice(start, end, 37.50)).toBe(150);
  });
});
