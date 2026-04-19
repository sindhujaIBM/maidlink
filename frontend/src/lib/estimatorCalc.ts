export type CleaningType   = 'Standard Cleaning' | 'Deep Cleaning' | 'Move-Out/Move-In Cleaning';
export type HouseCondition = 'Pristine' | 'Lightly Used' | 'Normal' | 'Moderately Dirty' | 'Heavily Soiled';
export type CookingFreq    = 'Rarely' | 'Occasionally' | 'Frequently';
export type CookingStyle   = 'Light' | 'Moderate' | 'Heavy';

export interface CalcResult {
  one: number;
  two: number;
}

/**
 * Calculates estimated cleaning hours for 1 and 2 cleaners.
 *
 * Base: bedrooms × 0.65 + bathrooms × 1.0 + residualSqft / 650
 *   residualSqft = max(0, sqft − bedrooms×175 − bathrooms×65)
 *   (subtracts avg room footprints so sqft only captures common areas)
 *
 * Extras (basement, laundry, garage) added before cleaning-type multiplier.
 * Oven, refrigerator, windows added after multiplier.
 * Cooking: only adds +0.75h when both Frequently AND Heavy (avoids double-count with condition).
 * Rounding: ≤ 4h → ceil to nearest 0.5; > 4h → ceil to nearest 1.
 */
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
): CalcResult {
  const isMoveOut = cleaningType === 'Move-Out/Move-In Cleaning';

  const residualSqft = Math.max(0, sqft - bedrooms * 175 - bathrooms * 65);
  let base = bedrooms * 0.65 + bathrooms * 1.0 + residualSqft / 650;

  // Location extras: added before cleaning-type multiplier, ignored for move-out
  if (!isMoveOut) {
    if (extras.includes('basement')) base += 1;
    if (extras.includes('laundry'))  base += 0.5;
    if (extras.includes('garage'))   base += 0.75;
  }

  // Cleaning type multipliers
  if (cleaningType === 'Deep Cleaning') base *= 1.75;
  if (isMoveOut)                        base *= 2.25;

  // Condition multipliers
  if (houseCondition === 'Pristine')         base *= 0.90;
  // 'Lightly Used' and 'Normal' → ×1.0 (no change)
  if (houseCondition === 'Moderately Dirty') base *= 1.30;
  if (houseCondition === 'Heavily Soiled')   base *= 1.75;

  // Flat additions (after multipliers)
  if (pets) base += 0.75;
  // Only add cooking overhead when both signals are at maximum — avoids
  // double-counting the kitchen-condition effect already captured by houseCondition
  if (cookingFreq === 'Frequently' && cookingStyle === 'Heavy') base += 0.75;

  // Appliance/feature extras: added after multipliers, ignored for move-out
  if (!isMoveOut) {
    if (extras.includes('oven'))         base += 1;
    if (extras.includes('refrigerator')) base += 0.5;
    if (extras.includes('windows'))      base += 1;
  }

  const round = (n: number) => n <= 4 ? Math.ceil(n * 2) / 2 : Math.ceil(n);
  return { one: round(base), two: round(base / 2) };
}

/**
 * Derives the ordered list of rooms to photograph from home details.
 * Kitchen and Living Room are user-selectable (default true for backwards compat).
 */
export function buildRoomList(
  bedrooms:         number,
  bathrooms:        number,
  extras:           string[],
  includeKitchen:   boolean = true,
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
