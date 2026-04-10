import { describe, it, expect } from 'vitest';
import { calcHours, buildRoomList } from '../lib/estimatorCalc';

// New formula: base = bedrooms×0.6 + bathrooms×0.9 + sqft/500 + 0.25 (setup buffer)
// Then BUFFER=0.5 added before rounding (pack-down time)
// Rounding: ≤4h → ceil to nearest 0.5; >4h → ceil to nearest 1

// ── Base formula ──────────────────────────────────────────────────────────────

describe('calcHours — base formula', () => {
  it('2 bed / 1 bath / 1000 sqft → 5h (1 cleaner)', () => {
    // base = 2×0.6 + 1×0.9 + 1000/500 + 0.25 = 1.2 + 0.9 + 2.0 + 0.25 = 4.35
    // +buffer: 4.35 + 0.5 = 4.85 → >4 → ceil(4.85) = 5
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    expect(r.one).toBe(5);
  });

  it('2 bed / 1 bath / 1000 sqft → 2.5h (2 cleaners)', () => {
    // (4.35 + 0.5) / 2 = 2.425 → ≤4 → ceil(2.425×2)/2 = ceil(4.85)/2 = 5/2 = 2.5
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    expect(r.two).toBe(2.5);
  });

  it('0 bed / 0 bath / 0 sqft → 1h (setup buffer only)', () => {
    // base = 0 + 0 + 0 + 0.25 = 0.25; +buffer: 0.75 → ≤4 → ceil(0.75×2)/2 = ceil(1.5)/2 = 1
    const r = calcHours(0, 0, 0, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    expect(r.one).toBe(1);
    expect(r.two).toBe(0.5);
  });

  it('bedrooms contribute 0.6h each', () => {
    const r3 = calcHours(3, 0, 0, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    const r4 = calcHours(4, 0, 0, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    // 3×0.6 + 0.25 + 0.5 = 2.55 → ≤4 → ceil(5.1)/2 = 3
    expect(r3.one).toBe(3);
    // 4×0.6 + 0.25 + 0.5 = 3.15 → ceil(6.3)/2 = 3.5
    expect(r4.one).toBe(3.5);
  });

  it('bathrooms contribute 0.9h each', () => {
    const r = calcHours(0, 2, 0, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    // 2×0.9 + 0.25 + 0.5 = 2.55 → ceil(5.1)/2 = 3
    expect(r.one).toBe(3);
  });

  it('sqft contributes sqft/500 hours', () => {
    const r = calcHours(0, 0, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    // 1000/500 + 0.25 + 0.5 = 2.75 → ≤4 → ceil(5.5)/2 = 3
    expect(r.one).toBe(3);
  });
});

// ── Cleaning type multipliers ─────────────────────────────────────────────────

describe('calcHours — cleaning type multipliers', () => {
  it('Deep Cleaning multiplies base by 1.5', () => {
    // base=4.35 × 1.5 = 6.525; +0.5 = 7.025 → >4 → ceil(7.025) = 8
    const r = calcHours(2, 1, 1000, 'Deep Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    expect(r.one).toBe(8);
  });

  it('Move-Out/Move-In multiplies base by 2', () => {
    // base=4.35 × 2 = 8.7; +0.5 = 9.2 → ceil(9.2) = 10
    const r = calcHours(2, 1, 1000, 'Move-Out/Move-In Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    expect(r.one).toBe(10);
  });
});

// ── Condition multipliers ─────────────────────────────────────────────────────

describe('calcHours — condition multipliers', () => {
  it('Moderately Dirty multiplies by 1.25', () => {
    // base=4.35 × 1.25 = 5.4375; +0.5 = 5.9375 → ceil(5.9375) = 6
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Moderately Dirty', false, 'Rarely', 'Light', []);
    expect(r.one).toBe(6);
  });

  it('Heavily Soiled multiplies by 1.5', () => {
    // base=4.35 × 1.5 = 6.525; +0.5 = 7.025 → ceil(7.025) = 8
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Heavily Soiled', false, 'Rarely', 'Light', []);
    expect(r.one).toBe(8);
  });
});

// ── Flat additions ────────────────────────────────────────────────────────────

describe('calcHours — flat additions', () => {
  it('pets adds 0.5h', () => {
    // base=4.35 + 0.5 = 4.85; +0.5 = 5.35 → ceil(5.35) = 6
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', true, 'Rarely', 'Light', []);
    expect(r.one).toBe(6);
  });

  it('cooking frequency Frequently adds 1h', () => {
    // base=4.35 + 1 = 5.35; +0.5 = 5.85 → ceil(5.85) = 6
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Frequently', 'Light', []);
    expect(r.one).toBe(6);
  });

  it('cooking style Heavy adds 1h', () => {
    // base=4.35 + 1 = 5.35; +0.5 = 5.85 → ceil(5.85) = 6
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Heavy', []);
    expect(r.one).toBe(6);
  });

  it('Occasionally and Moderate cooking add nothing', () => {
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Occasionally', 'Moderate', []);
    expect(r.one).toBe(5); // same as baseline
  });
});

// ── Extras ────────────────────────────────────────────────────────────────────

describe('calcHours — extras (Standard Cleaning)', () => {
  it('oven adds 1h (after multiplier)', () => {
    // base=4.35 + 1 = 5.35; +0.5 = 5.85 → ceil(5.85) = 6
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', ['oven']);
    expect(r.one).toBe(6);
  });

  it('refrigerator adds 0.5h', () => {
    // base=4.35 + 0.5 = 4.85; +0.5 = 5.35 → ceil(5.35) = 6
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', ['refrigerator']);
    expect(r.one).toBe(6);
  });

  it('windows adds 1h', () => {
    // base=4.35 + 1 = 5.35; +0.5 = 5.85 → ceil(5.85) = 6
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', ['windows']);
    expect(r.one).toBe(6);
  });

  it('basement adds 1h before multiplier', () => {
    // (base=4.35 + 1) = 5.35; +0.5 = 5.85 → ceil(5.85) = 6
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', ['basement']);
    expect(r.one).toBe(6);
  });

  it('laundry adds 0.5h before multiplier', () => {
    // (4.35 + 0.5) = 4.85; +0.5 = 5.35 → ceil(5.35) = 6
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', ['laundry']);
    expect(r.one).toBe(6);
  });

  it('garage adds 0.75h before multiplier', () => {
    // (4.35 + 0.75) = 5.1; +0.5 = 5.6 → ceil(5.6) = 6
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', ['garage']);
    expect(r.one).toBe(6);
  });

  it('Deep Cleaning applies multiplier on top of basement', () => {
    // (4.35 + 1) × 1.5 = 8.025; +0.5 = 8.525 → ceil(8.525) = 9
    const r = calcHours(2, 1, 1000, 'Deep Cleaning', 'Normal', false, 'Rarely', 'Light', ['basement']);
    expect(r.one).toBe(9);
  });
});

describe('calcHours — Move-Out ignores extras', () => {
  it('ignores basement, laundry, garage for move-out', () => {
    const withExtras    = calcHours(2, 1, 1000, 'Move-Out/Move-In Cleaning', 'Normal', false, 'Rarely', 'Light', ['basement', 'laundry', 'garage']);
    const withoutExtras = calcHours(2, 1, 1000, 'Move-Out/Move-In Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    expect(withExtras.one).toBe(withoutExtras.one);
  });

  it('ignores oven, refrigerator, windows for move-out', () => {
    const withExtras    = calcHours(2, 1, 1000, 'Move-Out/Move-In Cleaning', 'Normal', false, 'Rarely', 'Light', ['oven', 'refrigerator', 'windows']);
    const withoutExtras = calcHours(2, 1, 1000, 'Move-Out/Move-In Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    expect(withExtras.one).toBe(withoutExtras.one);
  });
});

// ── Rounding ──────────────────────────────────────────────────────────────────

describe('calcHours — rounding', () => {
  it('≤4h rounds to nearest 0.5 (ceil)', () => {
    // 0 bed/bath, 500 sqft: base = 1.0 + 0.25 + 0.5 = 1.75 → ceil(1.75×2)/2 = ceil(3.5)/2 = 4/2 = 2
    const r1 = calcHours(0, 0, 500, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    expect(r1.one).toBe(2);

    // 0 bed/bath, 625 sqft: base = 1.25 + 0.25 + 0.5 = 2.0 → ceil(2.0×2)/2 = 2
    const r2 = calcHours(0, 0, 625, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    expect(r2.one).toBe(2);
  });

  it('exactly 4h stays at 4', () => {
    // Need base + 0.5 = 4 → base = 3.5
    // 0 bed, 0 bath, 1625 sqft: 1625/500 + 0.25 = 3.5; +0.5 = 4.0 → round(4) = 4
    const r = calcHours(0, 0, 1625, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    expect(r.one).toBe(4);
  });

  it('>4h rounds to nearest 1 (ceil)', () => {
    // 2/1/1000 with pets: base=4.35 + 0.5 = 4.85; +0.5 = 5.35 → ceil(5.35) = 6
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', true, 'Rarely', 'Light', []);
    expect(r.one).toBe(6);
  });
});

// ── buildRoomList ─────────────────────────────────────────────────────────────

describe('buildRoomList', () => {
  it('always includes Kitchen and Living Room', () => {
    const rooms = buildRoomList(0, 0, []);
    expect(rooms).toContain('Kitchen');
    expect(rooms).toContain('Living Room');
  });

  it('uses singular "Bedroom" for 1 bedroom', () => {
    const rooms = buildRoomList(1, 0, []);
    expect(rooms).toContain('Bedroom');
    expect(rooms).not.toContain('Bedroom 1');
  });

  it('uses numbered bedrooms for multiple', () => {
    const rooms = buildRoomList(3, 0, []);
    expect(rooms).toContain('Bedroom 1');
    expect(rooms).toContain('Bedroom 2');
    expect(rooms).toContain('Bedroom 3');
  });

  it('uses singular "Bathroom" for exactly 1 full bath', () => {
    const rooms = buildRoomList(0, 1, []);
    expect(rooms).toContain('Bathroom');
    expect(rooms).not.toContain('Bathroom 1');
  });

  it('uses numbered bathrooms for multiple full baths', () => {
    const rooms = buildRoomList(0, 2, []);
    expect(rooms).toContain('Bathroom 1');
    expect(rooms).toContain('Bathroom 2');
  });

  it('adds Half Bathroom for 0.5 bath', () => {
    const rooms = buildRoomList(0, 0.5, []);
    expect(rooms).toContain('Half Bathroom');
  });

  it('adds Basement when in extras', () => {
    expect(buildRoomList(0, 0, ['basement'])).toContain('Basement');
    expect(buildRoomList(0, 0, [])).not.toContain('Basement');
  });

  it('adds Garage when in extras', () => {
    expect(buildRoomList(0, 0, ['garage'])).toContain('Garage');
    expect(buildRoomList(0, 0, [])).not.toContain('Garage');
  });

  it('returns rooms in a consistent order', () => {
    const rooms = buildRoomList(2, 1, ['basement', 'garage']);
    expect(rooms[0]).toBe('Kitchen');
    expect(rooms[1]).toBe('Living Room');
    // Basement and Garage come last
    expect(rooms[rooms.length - 2]).toBe('Basement');
    expect(rooms[rooms.length - 1]).toBe('Garage');
  });
});
