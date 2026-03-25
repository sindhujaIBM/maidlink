import { describe, it, expect } from 'vitest';
import { isCalgaryPostal } from '../validation/calgary';
import {
  assertMinDuration,
  assertFutureDate,
  assertValidDateRange,
  MIN_BOOKING_HOURS,
} from '../validation/booking';
import { ValidationError } from '../errors';

// ── Calgary postal code ────────────────────────────────────────────────────────

describe('isCalgaryPostal', () => {
  it('accepts valid Calgary codes with space', () => {
    expect(isCalgaryPostal('T2P 1J9')).toBe(true);
    expect(isCalgaryPostal('T3A 2B3')).toBe(true);
    expect(isCalgaryPostal('T2N 4B3')).toBe(true);
  });

  it('accepts valid Calgary codes without space', () => {
    expect(isCalgaryPostal('T2P1J9')).toBe(true);
    expect(isCalgaryPostal('T3H4A1')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isCalgaryPostal('t2p 1j9')).toBe(true);
    expect(isCalgaryPostal('T2P 1j9')).toBe(true);
  });

  it('rejects non-Calgary Alberta codes', () => {
    expect(isCalgaryPostal('T4A 1A1')).toBe(false); // Airdrie
    expect(isCalgaryPostal('T8N 1A1')).toBe(false); // Fort Saskatchewan
  });

  it('rejects other province codes', () => {
    expect(isCalgaryPostal('M5V 3A8')).toBe(false); // Toronto
    expect(isCalgaryPostal('V6B 1A1')).toBe(false); // Vancouver
    expect(isCalgaryPostal('H2Y 1C6')).toBe(false); // Montreal
  });

  it('rejects empty string', () => {
    expect(isCalgaryPostal('')).toBe(false);
  });

  it('rejects partial codes', () => {
    expect(isCalgaryPostal('T2P')).toBe(false);
    expect(isCalgaryPostal('T2P 1')).toBe(false);
  });

  it('rejects numeric-only strings', () => {
    expect(isCalgaryPostal('12345')).toBe(false);
  });
});

// ── assertMinDuration ─────────────────────────────────────────────────────────

describe('assertMinDuration', () => {
  it(`passes for exactly ${MIN_BOOKING_HOURS} hours`, () => {
    const start = new Date('2030-01-01T10:00:00Z');
    const end   = new Date(`2030-01-01T${10 + MIN_BOOKING_HOURS}:00:00Z`);
    expect(() => assertMinDuration(start, end)).not.toThrow();
  });

  it('passes for more than the minimum', () => {
    const start = new Date('2030-01-01T09:00:00Z');
    const end   = new Date('2030-01-01T15:00:00Z'); // 6 hours
    expect(() => assertMinDuration(start, end)).not.toThrow();
  });

  it('throws for 1 hour', () => {
    const start = new Date('2030-01-01T10:00:00Z');
    const end   = new Date('2030-01-01T11:00:00Z');
    expect(() => assertMinDuration(start, end)).toThrow(ValidationError);
    expect(() => assertMinDuration(start, end)).toThrow(`${MIN_BOOKING_HOURS} hours`);
  });

  it('throws for 2.5 hours (just under minimum)', () => {
    const start = new Date('2030-01-01T10:00:00Z');
    const end   = new Date('2030-01-01T12:30:00Z');
    expect(() => assertMinDuration(start, end)).toThrow(ValidationError);
  });
});

// ── assertFutureDate ──────────────────────────────────────────────────────────

describe('assertFutureDate', () => {
  it('passes for a date 24 hours from now', () => {
    const future = new Date(Date.now() + 86_400_000);
    expect(() => assertFutureDate(future)).not.toThrow();
  });

  it('throws for a past date', () => {
    const past = new Date(Date.now() - 86_400_000);
    expect(() => assertFutureDate(past)).toThrow(ValidationError);
    expect(() => assertFutureDate(past)).toThrow('future');
  });

  it('throws for the current moment (boundary)', () => {
    const now = new Date();
    expect(() => assertFutureDate(now)).toThrow(ValidationError);
  });
});

// ── assertValidDateRange ──────────────────────────────────────────────────────

describe('assertValidDateRange', () => {
  it('passes for a valid start < end range', () => {
    const start = new Date('2030-01-01T10:00:00Z');
    const end   = new Date('2030-01-01T13:00:00Z');
    expect(() => assertValidDateRange(start, end)).not.toThrow();
  });

  it('throws when end equals start', () => {
    const d = new Date('2030-01-01T10:00:00Z');
    expect(() => assertValidDateRange(d, d)).toThrow('after startAt');
  });

  it('throws when end is before start', () => {
    const start = new Date('2030-01-01T13:00:00Z');
    const end   = new Date('2030-01-01T10:00:00Z');
    expect(() => assertValidDateRange(start, end)).toThrow('after startAt');
  });

  it('throws for invalid startAt', () => {
    expect(() => assertValidDateRange(new Date('not-a-date'), new Date('2030-01-01T10:00:00Z')))
      .toThrow('Invalid startAt');
  });

  it('throws for invalid endAt', () => {
    expect(() => assertValidDateRange(new Date('2030-01-01T10:00:00Z'), new Date('not-a-date')))
      .toThrow('Invalid endAt');
  });
});
