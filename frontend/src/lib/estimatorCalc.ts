export type CleaningType   = 'Standard Cleaning' | 'Deep Cleaning' | 'Move-Out/Move-In Cleaning' | 'Short-Term Rental Turnover';
export type HouseCondition = 'Pristine' | 'Lightly Used' | 'Normal' | 'Moderately Dirty' | 'Heavily Soiled';
export type CookingFreq    = 'Rarely' | 'Occasionally' | 'Frequently';
export type CookingStyle   = 'Light' | 'Moderate' | 'Heavy';
export type CleanFrequency = 'One-time' | 'Monthly' | 'Biweekly' | 'Weekly';

export interface CalcResult {
  one: number;
  two: number;
  oneMax: number; // upper bound for a less-experienced cleaner (×NEWBIE_MULTIPLIER)
  twoMax: number;
}

// Upper-bound multiplier applied to produce the "max" estimate shown to customers.
// A newer cleaner may take up to this much longer than the baseline.
export const NEWBIE_MULTIPLIER = 1.35;

// Recurring cleans take less time because the home stays maintained between visits.
// Multipliers relative to a one-time standard clean.
export const FREQ_MULTIPLIER: Record<CleanFrequency, number> = {
  'One-time':  1.00,
  'Monthly':   0.95, // slight buildup between visits
  'Biweekly':  0.80, // well-maintained, noticeably faster
  'Weekly':    0.65, // home stays very clean, quick refresh
};

// Rates per cleaner per hour (excl. GST). STR set at Calgary market midpoint ($50/hr).
export const CLEAN_RATE: Record<CleaningType, Partial<Record<CleanFrequency, number>> & { 'One-time': number }> = {
  'Standard Cleaning':           { 'One-time': 40, 'Monthly': 35, 'Biweekly': 33, 'Weekly': 30 },
  'Deep Cleaning':               { 'One-time': 40 },
  'Move-Out/Move-In Cleaning':   { 'One-time': 45 },
  'Short-Term Rental Turnover':  { 'One-time': 50 },
};

export const GST = 0.05;

export function getRate(type: CleaningType, frequency: CleanFrequency): number {
  return CLEAN_RATE[type][frequency as keyof typeof CLEAN_RATE[typeof type]] ?? CLEAN_RATE[type]['One-time'];
}

/**
 * Calculates estimated cleaning hours for 1 and 2 cleaners.
 *
 * Base: bedrooms × 0.65 + bathrooms × 1.0 + residualSqft / 650
 *   residualSqft = max(0, sqft − bedrooms×175 − bathrooms×65)
 *
 * Frequency multiplier applied to Standard Cleaning only:
 *   Weekly ×0.65 / Biweekly ×0.80 / Monthly ×0.95 / One-time ×1.0
 *
 * STR Turnover: treated like Standard (no deep multiplier), always Normal condition,
 *   +0.5h fixed for linen/towel turnover, extras ignored.
 *
 * Rounding: ≤ 4h → ceil to nearest 0.5; > 4h → ceil to nearest 1.
 */
export const roundHours = (n: number) => n <= 4 ? Math.ceil(n * 2) / 2 : Math.ceil(n);

export function calcHours(
  bedrooms: number,
  bathrooms: number,
  sqft: number,
  cleaningType: CleaningType,
  houseCondition: HouseCondition,
  pets: boolean,
  cookingFreq: CookingFreq,
  cookingStyle: CookingStyle,
  extras: string[],
  frequency: CleanFrequency = 'One-time',
): CalcResult {
  const isMoveOut = cleaningType === 'Move-Out/Move-In Cleaning';
  const isSTR     = cleaningType === 'Short-Term Rental Turnover';

  const residualSqft = Math.max(0, sqft - bedrooms * 175 - bathrooms * 65);
  let base = bedrooms * 0.65 + bathrooms * 1.0 + residualSqft / 650;

  // Location extras: added before cleaning-type multiplier; basement/garage apply for move-out too
  if (!isSTR) {
    if (extras.includes('basement')) base += 1;
    if (extras.includes('garage'))   base += 0.75;
  }

  // Cleaning type multipliers
  if (cleaningType === 'Deep Cleaning')    base *= 1.75;
  if (isMoveOut)                           base *= 2.25;
  if (cleaningType === 'Standard Cleaning') base *= FREQ_MULTIPLIER[frequency];

  // Condition multipliers — skipped for STR (turnover properties should be maintained;
  // a trashed STR is a damage claim, not a cleaning upsell)
  if (!isSTR) {
    if (houseCondition === 'Pristine')         base *= 0.90;
    if (houseCondition === 'Moderately Dirty') base *= 1.30;
    if (houseCondition === 'Heavily Soiled')   base *= 1.75;
  }

  // Flat additions (after multipliers) — not applicable to move-out or STR
  if (!isMoveOut && !isSTR) {
    if (pets) base += 0.75;
    if (cookingFreq === 'Frequently' && cookingStyle === 'Heavy') base += 0.75;
  }

  // STR: fixed linen + towel turnover task
  if (isSTR) base += 0.5;

  // Appliance/feature extras: after multipliers, ignored for move-out and STR
  if (!isMoveOut && !isSTR) {
    if (extras.includes('oven'))         base += 1;
    if (extras.includes('refrigerator')) base += 0.5;
    if (extras.includes('windows'))      base += 1;
  }

  const round = (n: number) => n <= 4 ? Math.ceil(n * 2) / 2 : Math.ceil(n);
  return {
    one:    round(base),
    two:    round(base / 2),
    oneMax: round(base * NEWBIE_MULTIPLIER),
    twoMax: round(base / 2 * NEWBIE_MULTIPLIER),
  };
}

/**
 * Derives the ordered list of rooms to photograph from home details.
 * Kitchen and Living Room are user-selectable (default true for backwards compat).
 */
export function buildRoomList(
  bedrooms:          number,
  bathrooms:         number,
  extras:            string[],
  includeKitchen:    boolean = true,
  includeLivingRoom: boolean = true,
): string[] {
  const rooms: string[] = [];

  if (includeKitchen)    rooms.push('Kitchen');
  if (includeLivingRoom) rooms.push('Living Room');

  for (let i = 1; i <= bedrooms; i++) {
    rooms.push(bedrooms === 1 ? 'Bedroom' : `Bedroom ${i}`);
  }

  const fullBaths = Math.floor(bathrooms);
  const hasHalf   = bathrooms % 1 >= 0.5;
  for (let i = 1; i <= fullBaths; i++) {
    rooms.push(fullBaths === 1 && !hasHalf ? 'Bathroom' : `Bathroom ${i}`);
  }
  if (hasHalf) rooms.push('Half Bathroom');

  if (extras.includes('basement')) rooms.push('Basement');
  if (extras.includes('garage'))   rooms.push('Garage');

  return rooms;
}
