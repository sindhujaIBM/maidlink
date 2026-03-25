import { describe, it, expect } from 'vitest';
import { calcHours, buildRoomList } from '../lib/estimatorCalc';

// ── Base formula ──────────────────────────────────────────────────────────────

describe('calcHours — base formula', () => {
  it('2 bed / 1 bath / 1000 sqft → 4h (1 cleaner)', () => {
    // base = 2×0.5 + 1×0.75 + 1000/500 = 1 + 0.75 + 2 = 3.75
    // round(3.75): ≤4 → ceil(3.75×2)/2 = ceil(7.5)/2 = 8/2 = 4
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    expect(r.one).toBe(4);
  });

  it('2 bed / 1 bath / 1000 sqft → 2h (2 cleaners)', () => {
    // two = round(3.75/2) = round(1.875): ceil(1.875×2)/2 = ceil(3.75)/2 = 2
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    expect(r.two).toBe(2);
  });

  it('0 bed / 0 bath / 0 sqft → 0h', () => {
    const r = calcHours(0, 0, 0, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    expect(r.one).toBe(0);
    expect(r.two).toBe(0);
  });

  it('bedrooms contribute 0.5h each', () => {
    const r3 = calcHours(3, 0, 0, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    const r4 = calcHours(4, 0, 0, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    // 3×0.5=1.5 → round=1.5; 4×0.5=2 → round=2
    expect(r3.one).toBe(1.5);
    expect(r4.one).toBe(2);
  });

  it('bathrooms contribute 0.75h each', () => {
    const r = calcHours(0, 2, 0, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    // 2×0.75=1.5 → round=1.5
    expect(r.one).toBe(1.5);
  });

  it('sqft contributes sqft/500 hours', () => {
    const r = calcHours(0, 0, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    // 1000/500=2 → round=2
    expect(r.one).toBe(2);
  });
});

// ── Cleaning type multipliers ─────────────────────────────────────────────────

describe('calcHours — cleaning type multipliers', () => {
  it('Deep Cleaning multiplies base by 1.5', () => {
    // base=3.75 × 1.5 = 5.625 → >4 → ceil(5.625)=6
    const r = calcHours(2, 1, 1000, 'Deep Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    expect(r.one).toBe(6);
  });

  it('Move-Out/Move-In multiplies base by 2', () => {
    // base=3.75 × 2 = 7.5 → ceil(7.5)=8
    const r = calcHours(2, 1, 1000, 'Move-Out/Move-In Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    expect(r.one).toBe(8);
  });
});

// ── Condition multipliers ─────────────────────────────────────────────────────

describe('calcHours — condition multipliers', () => {
  it('Moderately Dirty multiplies by 1.25', () => {
    // base=3.75 × 1.25 = 4.6875 → >4 → ceil(4.6875)=5
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Moderately Dirty', false, 'Rarely', 'Light', []);
    expect(r.one).toBe(5);
  });

  it('Heavily Soiled multiplies by 1.5', () => {
    // base=3.75 × 1.5 = 5.625 → ceil(5.625)=6
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Heavily Soiled', false, 'Rarely', 'Light', []);
    expect(r.one).toBe(6);
  });
});

// ── Flat additions ────────────────────────────────────────────────────────────

describe('calcHours — flat additions', () => {
  it('pets adds 0.5h', () => {
    // base=3.75 + 0.5 = 4.25 → >4 → ceil(4.25)=5
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', true, 'Rarely', 'Light', []);
    expect(r.one).toBe(5);
  });

  it('cooking frequency Frequently adds 1h', () => {
    // base=3.75 + 1 = 4.75 → ceil(4.75)=5
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Frequently', 'Light', []);
    expect(r.one).toBe(5);
  });

  it('cooking style Heavy adds 1h', () => {
    // base=3.75 + 1 = 4.75 → ceil(4.75)=5
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Heavy', []);
    expect(r.one).toBe(5);
  });

  it('Occasionally and Moderate cooking add nothing', () => {
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Occasionally', 'Moderate', []);
    expect(r.one).toBe(4); // same as baseline
  });
});

// ── Extras ────────────────────────────────────────────────────────────────────

describe('calcHours — extras (Standard Cleaning)', () => {
  it('oven adds 1h (after multiplier)', () => {
    // base=3.75 × (no multiplier) + 1 = 4.75 → ceil(4.75)=5
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', ['oven']);
    expect(r.one).toBe(5);
  });

  it('refrigerator adds 0.5h', () => {
    // base=3.75 + 0.5 = 4.25 → ceil(4.25)=5
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', ['refrigerator']);
    expect(r.one).toBe(5);
  });

  it('windows adds 1h', () => {
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', ['windows']);
    expect(r.one).toBe(5);
  });

  it('basement adds 1h before multiplier', () => {
    // (base=3.75 + 1) = 4.75 → ceil=5
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', ['basement']);
    expect(r.one).toBe(5);
  });

  it('laundry adds 0.5h before multiplier', () => {
    // (3.75 + 0.5) = 4.25 → ceil=5
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', ['laundry']);
    expect(r.one).toBe(5);
  });

  it('garage adds 0.75h before multiplier', () => {
    // (3.75 + 0.75) = 4.5 → >4 → ceil(4.5)=5
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', ['garage']);
    expect(r.one).toBe(5);
  });

  it('Deep Cleaning applies multiplier on top of basement', () => {
    // (3.75 + 1) × 1.5 = 7.125 → ceil(7.125)=8
    const r = calcHours(2, 1, 1000, 'Deep Cleaning', 'Normal', false, 'Rarely', 'Light', ['basement']);
    expect(r.one).toBe(8);
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
    // 0 bed/bath, 500 sqft → base=1 → round(1)=1
    const r1 = calcHours(0, 0, 500, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    expect(r1.one).toBe(1);

    // base=1.25 → ceil(1.25×2)/2 = ceil(2.5)/2 = 3/2 = 1.5
    const r2 = calcHours(0, 0, 625, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    expect(r2.one).toBe(1.5);
  });

  it('exactly 4h stays at 4', () => {
    // Need base exactly=4: 0 bed, 0 bath, 2000 sqft → 2000/500=4
    const r = calcHours(0, 0, 2000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    expect(r.one).toBe(4);
  });

  it('>4h rounds to nearest 1 (ceil)', () => {
    // base=4.25 → ceil(4.25)=5
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', true, 'Rarely', 'Light', []);
    expect(r.one).toBe(5);
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
