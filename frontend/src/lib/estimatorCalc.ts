export type CleaningType   = 'Standard Cleaning' | 'Deep Cleaning' | 'Move-Out/Move-In Cleaning';
export type HouseCondition = 'Normal' | 'Moderately Dirty' | 'Heavily Soiled';
export type CookingFreq    = 'Rarely' | 'Occasionally' | 'Frequently';
export type CookingStyle   = 'Light' | 'Moderate' | 'Heavy';

export interface CalcResult {
  one: number;
  two: number;
}

/**
 * Calculates estimated cleaning hours for 1 and 2 cleaners.
 *
 * Base: bedrooms × 0.5 + bathrooms × 0.75 + sqft / 500
 * Extras (basement, laundry, garage) added before cleaning-type multiplier.
 * Oven, refrigerator, windows added after multiplier.
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
  let base = bedrooms * 0.5 + bathrooms * 0.75 + sqft / 500;

  // Location extras: added before cleaning-type multiplier, ignored for move-out
  if (!isMoveOut) {
    if (extras.includes('basement')) base += 1;
    if (extras.includes('laundry'))  base += 0.5;
    if (extras.includes('garage'))   base += 0.75;
  }

  // Cleaning type multipliers
  if (cleaningType === 'Deep Cleaning') base *= 1.5;
  if (isMoveOut)                        base *= 2;

  // Condition multipliers
  if (houseCondition === 'Moderately Dirty') base *= 1.25;
  if (houseCondition === 'Heavily Soiled')   base *= 1.5;

  // Flat additions (after multipliers)
  if (pets)                         base += 0.5;
  if (cookingFreq === 'Frequently') base += 1;
  if (cookingStyle === 'Heavy')     base += 1;

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
 */
export function buildRoomList(bedrooms: number, bathrooms: number, extras: string[]): string[] {
  const rooms: string[] = ['Kitchen', 'Living Room'];

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
