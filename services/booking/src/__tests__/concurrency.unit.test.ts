import { describe, it, expect } from 'vitest';
import { buildTstzRange } from '../lib/concurrency';

describe('buildTstzRange', () => {
  it('produces a half-open [start, end) interval', () => {
    const start = new Date('2030-06-15T10:00:00.000Z');
    const end   = new Date('2030-06-15T13:00:00.000Z');
    expect(buildTstzRange(start, end))
      .toBe('[2030-06-15T10:00:00.000Z, 2030-06-15T13:00:00.000Z)');
  });

  it('uses [ for inclusive start', () => {
    const range = buildTstzRange(
      new Date('2030-01-01T09:00:00Z'),
      new Date('2030-01-01T12:00:00Z'),
    );
    expect(range.startsWith('[')).toBe(true);
  });

  it('uses ) for exclusive end', () => {
    const range = buildTstzRange(
      new Date('2030-01-01T09:00:00Z'),
      new Date('2030-01-01T12:00:00Z'),
    );
    expect(range.endsWith(')')).toBe(true);
  });

  it('preserves milliseconds in both timestamps', () => {
    const start = new Date('2030-06-15T10:00:00.123Z');
    const end   = new Date('2030-06-15T13:00:00.456Z');
    const range = buildTstzRange(start, end);
    expect(range).toContain('10:00:00.123Z');
    expect(range).toContain('13:00:00.456Z');
  });

  it('separates start and end with a comma and space', () => {
    const range = buildTstzRange(
      new Date('2030-01-01T10:00:00Z'),
      new Date('2030-01-01T13:00:00Z'),
    );
    // Format: [<iso>, <iso>)
    expect(range).toMatch(/^\[.+, .+\)$/);
  });

  it('handles same-day morning to evening', () => {
    const start = new Date('2030-03-15T08:00:00.000Z');
    const end   = new Date('2030-03-15T17:00:00.000Z');
    expect(buildTstzRange(start, end))
      .toBe('[2030-03-15T08:00:00.000Z, 2030-03-15T17:00:00.000Z)');
  });
});
