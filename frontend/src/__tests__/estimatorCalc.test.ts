import { describe, it, expect } from 'vitest';
import { calcHours, buildRoomList, getRate, FREQ_MULTIPLIER, GST } from '../lib/estimatorCalc';

// Baseline: 2 bed / 1 bath / 1000 sqft / Normal / Standard
//   residual = max(0, 1000 − 2×175 − 1×65) = 585
//   base     = 2×0.65 + 1×1.0 + 585/650 = 1.30 + 1.0 + 0.90 = 3.20
//   one      = ceil(3.20×2)/2 = ceil(6.4)/2 = 7/2 = 3.5
//   two      = 3.20/2 = 1.6 → ceil(3.2)/2 = 4/2 = 2.0

// ── Base formula ──────────────────────────────────────────────────────────────

describe('calcHours — base formula', () => {
  it('2 bed / 1 bath / 1000 sqft → 3.5h (1 cleaner)', () => {
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    expect(r.one).toBe(3.5);
  });

  it('2 bed / 1 bath / 1000 sqft → 2h (2 cleaners)', () => {
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    expect(r.two).toBe(2);
  });

  it('0 bed / 0 bath / 0 sqft → 0h', () => {
    const r = calcHours(0, 0, 0, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    expect(r.one).toBe(0);
    expect(r.two).toBe(0);
  });

  it('bedrooms contribute 0.65h each (sqft below room footprints clamps to 0)', () => {
    // residual = max(0, 0 − 3×175) = 0 → base = 3×0.65 = 1.95 → ceil(3.9)/2 = 2
    const r3 = calcHours(3, 0, 0, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    expect(r3.one).toBe(2);
    // residual = max(0, 0 − 4×175) = 0 → base = 4×0.65 = 2.6 → ceil(5.2)/2 = 3
    const r4 = calcHours(4, 0, 0, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    expect(r4.one).toBe(3);
  });

  it('bathrooms contribute 1.0h each', () => {
    // residual = max(0, 0 − 2×65) = 0 → base = 2×1.0 = 2.0 → ceil(4.0)/2 = 2
    const r = calcHours(0, 2, 0, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    expect(r.one).toBe(2);
  });

  it('sqft-only home: residual = sqft, contributes sqft/650 hours', () => {
    // residual = 1000 → base = 1000/650 = 1.538 → ceil(3.077)/2 = 4/2 = 2
    const r = calcHours(0, 0, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    expect(r.one).toBe(2);
  });

  it('residual sqft clamps to 0 when rooms exceed total sqft', () => {
    // 4 bed / 2 bath in a tiny 500 sqft: footprints (4×175 + 2×65) = 830 > 500 → residual = 0
    const r = calcHours(4, 2, 500, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    const rNoSqft = calcHours(4, 2, 0, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    expect(r.one).toBe(rNoSqft.one);
  });
});

// ── Cleaning type multipliers ─────────────────────────────────────────────────

describe('calcHours — cleaning type multipliers', () => {
  it('Deep Cleaning multiplies base by 1.75', () => {
    // base=3.20 × 1.75 = 5.6 → >4 → ceil(5.6) = 6
    const r = calcHours(2, 1, 1000, 'Deep Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    expect(r.one).toBe(6);
  });

  it('Move-Out/Move-In multiplies base by 2.25', () => {
    // base=3.20 × 2.25 = 7.2 → >4 → ceil(7.2) = 8
    const r = calcHours(2, 1, 1000, 'Move-Out/Move-In Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    expect(r.one).toBe(8);
  });
});

// ── Condition multipliers ─────────────────────────────────────────────────────

describe('calcHours — condition multipliers', () => {
  it('Pristine multiplies by 0.90', () => {
    // base=3.20 × 0.90 = 2.88 → ≤4 → ceil(5.76)/2 = 6/2 = 3
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Pristine', false, 'Rarely', 'Light', []);
    expect(r.one).toBe(3);
  });

  it('Moderately Dirty multiplies by 1.30', () => {
    // base=3.20 × 1.30 = 4.16 → >4 → ceil(4.16) = 5
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Moderately Dirty', false, 'Rarely', 'Light', []);
    expect(r.one).toBe(5);
  });

  it('Heavily Soiled multiplies by 1.75', () => {
    // base=3.20 × 1.75 = 5.6 → >4 → ceil(5.6) = 6
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Heavily Soiled', false, 'Rarely', 'Light', []);
    expect(r.one).toBe(6);
  });
});

// ── Flat additions ────────────────────────────────────────────────────────────

describe('calcHours — flat additions', () => {
  it('pets adds 0.75h', () => {
    // base=3.20 + 0.75 = 3.95 → ≤4 → ceil(7.9)/2 = 8/2 = 4
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', true, 'Rarely', 'Light', []);
    expect(r.one).toBe(4);
  });

  it('cooking Frequently alone adds nothing', () => {
    // only stacks when paired with Heavy
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Frequently', 'Light', []);
    expect(r.one).toBe(3.5);
  });

  it('cooking Heavy alone adds nothing', () => {
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Heavy', []);
    expect(r.one).toBe(3.5);
  });

  it('Frequently + Heavy together add 0.75h', () => {
    // base=3.20 + 0.75 = 3.95 → ≤4 → ceil(7.9)/2 = 4
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Frequently', 'Heavy', []);
    expect(r.one).toBe(4);
  });

  it('Occasionally and Moderate cooking add nothing', () => {
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Occasionally', 'Moderate', []);
    expect(r.one).toBe(3.5);
  });
});

// ── Extras ────────────────────────────────────────────────────────────────────

describe('calcHours — extras (Standard Cleaning)', () => {
  it('oven adds 1h (after multiplier)', () => {
    // base=3.20 + 1 = 4.2 → >4 → ceil(4.2) = 5
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', ['oven']);
    expect(r.one).toBe(5);
  });

  it('refrigerator adds 0.5h', () => {
    // base=3.20 + 0.5 = 3.7 → ≤4 → ceil(7.4)/2 = 8/2 = 4
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', ['refrigerator']);
    expect(r.one).toBe(4);
  });

  it('windows adds 1h', () => {
    // base=3.20 + 1 = 4.2 → >4 → ceil(4.2) = 5
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', ['windows']);
    expect(r.one).toBe(5);
  });

  it('basement adds 1h before multiplier', () => {
    // (3.20 + 1) × 1.0 = 4.2 → >4 → ceil(4.2) = 5
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', ['basement']);
    expect(r.one).toBe(5);
  });

  it('laundry adds 0.5h before multiplier', () => {
    // (3.20 + 0.5) = 3.7 → ≤4 → ceil(7.4)/2 = 4
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', ['laundry']);
    expect(r.one).toBe(4);
  });

  it('garage adds 0.75h before multiplier', () => {
    // (3.20 + 0.75) = 3.95 → ≤4 → ceil(7.9)/2 = 4
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', ['garage']);
    expect(r.one).toBe(4);
  });

  it('Deep Cleaning applies 1.75× multiplier on top of basement', () => {
    // (3.20 + 1) × 1.75 = 4.2 × 1.75 = 7.35 → >4 → ceil(7.35) = 8
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
    // 0/0/500: base = 500/650 = 0.769 → ceil(1.538)/2 = 2/2 = 1
    const r1 = calcHours(0, 0, 500, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    expect(r1.one).toBe(1);

    // 0/0/750: base = 750/650 = 1.154 → ceil(2.308)/2 = 3/2 = 1.5
    const r2 = calcHours(0, 0, 750, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    expect(r2.one).toBe(1.5);
  });

  it('exactly 4h stays at 4', () => {
    // 0/0/2600: base = 2600/650 = 4.0 → ceil(8.0)/2 = 4
    const r = calcHours(0, 0, 2600, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', []);
    expect(r.one).toBe(4);
  });

  it('>4h rounds to nearest 1 (ceil)', () => {
    // 2/1/1000 with oven: base=3.20 + 1.0 = 4.2 → >4 → ceil(4.2) = 5
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', ['oven']);
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
    expect(rooms[rooms.length - 2]).toBe('Basement');
    expect(rooms[rooms.length - 1]).toBe('Garage');
  });
});

// ── Recurring frequency multipliers ───────────────────────────────────────────

describe('calcHours — recurring frequency (Standard Cleaning only)', () => {
  // Baseline one-time standard: 2/1/1000 base = 3.20 → one = 3.5

  it('One-time applies ×1.0 (no change)', () => {
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', [], 'One-time');
    expect(r.one).toBe(3.5);
  });

  it('Monthly applies ×0.95', () => {
    // 3.20 × 0.95 = 3.04 → ≤4 → ceil(6.08)/2 = 7/2 = 3.5
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', [], 'Monthly');
    expect(r.one).toBe(3.5);
  });

  it('Biweekly applies ×0.80', () => {
    // 3.20 × 0.80 = 2.56 → ≤4 → ceil(5.12)/2 = 6/2 = 3
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', [], 'Biweekly');
    expect(r.one).toBe(3);
  });

  it('Weekly applies ×0.65', () => {
    // 3.20 × 0.65 = 2.08 → ≤4 → ceil(4.16)/2 = 5/2 = 2.5
    const r = calcHours(2, 1, 1000, 'Standard Cleaning', 'Normal', false, 'Rarely', 'Light', [], 'Weekly');
    expect(r.one).toBe(2.5);
  });

  it('frequency has no effect on Deep Cleaning', () => {
    const oneTime = calcHours(2, 1, 1000, 'Deep Cleaning', 'Normal', false, 'Rarely', 'Light', [], 'One-time');
    const weekly  = calcHours(2, 1, 1000, 'Deep Cleaning', 'Normal', false, 'Rarely', 'Light', [], 'Weekly');
    expect(oneTime.one).toBe(weekly.one);
  });

  it('frequency has no effect on Move-Out Cleaning', () => {
    const oneTime = calcHours(2, 1, 1000, 'Move-Out/Move-In Cleaning', 'Normal', false, 'Rarely', 'Light', [], 'One-time');
    const weekly  = calcHours(2, 1, 1000, 'Move-Out/Move-In Cleaning', 'Normal', false, 'Rarely', 'Light', [], 'Weekly');
    expect(oneTime.one).toBe(weekly.one);
  });
});

// ── Short-Term Rental Turnover ────────────────────────────────────────────────

describe('calcHours — Short-Term Rental Turnover', () => {
  // 2/1/1000: residual=585, base = 2×0.65 + 1×1.0 + 585/650 = 3.20
  // STR: no type multiplier, no condition mult, +0.5h linen → 3.70 → ceil(7.4)/2 = 4

  it('adds 0.5h for linen turnover and ignores condition multiplier', () => {
    const normal  = calcHours(2, 1, 1000, 'Short-Term Rental Turnover', 'Normal',         false, 'Rarely', 'Light', []);
    const soiled  = calcHours(2, 1, 1000, 'Short-Term Rental Turnover', 'Heavily Soiled', false, 'Rarely', 'Light', []);
    expect(normal.one).toBe(4);
    expect(soiled.one).toBe(normal.one);
  });

  it('ignores pets for STR', () => {
    const noPets   = calcHours(2, 1, 1000, 'Short-Term Rental Turnover', 'Normal', false, 'Rarely', 'Light', []);
    const withPets = calcHours(2, 1, 1000, 'Short-Term Rental Turnover', 'Normal', true,  'Rarely', 'Light', []);
    expect(noPets.one).toBe(withPets.one);
  });

  it('ignores extras for STR', () => {
    const noExtras   = calcHours(2, 1, 1000, 'Short-Term Rental Turnover', 'Normal', false, 'Rarely', 'Light', []);
    const withExtras = calcHours(2, 1, 1000, 'Short-Term Rental Turnover', 'Normal', false, 'Rarely', 'Light', ['oven', 'basement', 'windows']);
    expect(noExtras.one).toBe(withExtras.one);
  });
});

// ── Rates & GST ───────────────────────────────────────────────────────────────

describe('getRate — pricing table', () => {
  it('Standard one-time = $40/hr', () => expect(getRate('Standard Cleaning', 'One-time')).toBe(40));
  it('Standard monthly  = $35/hr', () => expect(getRate('Standard Cleaning', 'Monthly')).toBe(35));
  it('Standard biweekly = $33/hr', () => expect(getRate('Standard Cleaning', 'Biweekly')).toBe(33));
  it('Standard weekly   = $30/hr', () => expect(getRate('Standard Cleaning', 'Weekly')).toBe(30));
  it('Deep one-time     = $40/hr', () => expect(getRate('Deep Cleaning', 'One-time')).toBe(40));
  it('Move-Out          = $45/hr', () => expect(getRate('Move-Out/Move-In Cleaning', 'One-time')).toBe(45));
  it('STR               = $50/hr', () => expect(getRate('Short-Term Rental Turnover', 'One-time')).toBe(50));
  it('GST rate is 5%',              () => expect(GST).toBe(0.05));

  it('FREQ_MULTIPLIER covers all four frequencies', () => {
    expect(FREQ_MULTIPLIER['One-time']).toBe(1.00);
    expect(FREQ_MULTIPLIER['Monthly']).toBe(0.95);
    expect(FREQ_MULTIPLIER['Biweekly']).toBe(0.80);
    expect(FREQ_MULTIPLIER['Weekly']).toBe(0.65);
  });

  it('Deep frequency falls back to One-time rate', () => {
    expect(getRate('Deep Cleaning', 'Weekly')).toBe(40);
  });
});
