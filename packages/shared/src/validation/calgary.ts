/**
 * Calgary postal code validation.
 *
 * Canadian postal codes follow FSA (Forward Sortation Area) + LDU format.
 * Calgary postal codes are in the T2x and T3x ranges.
 *
 * Note: this list is approximate. Some T1x FSAs cover parts of Calgary.
 * For an MVP this is sufficient; post-MVP replace with a curated FSA list.
 */
const CALGARY_FSA_PREFIXES = new Set([
  'T1Y', 'T1Z',                                 // NE Calgary
  'T2A', 'T2B', 'T2C', 'T2E', 'T2G', 'T2H',   // SE / SW
  'T2J', 'T2K', 'T2L', 'T2M', 'T2N', 'T2P',   // NW / downtown
  'T2R', 'T2S', 'T2T', 'T2V', 'T2W', 'T2X',   // SW / SE
  'T2Y', 'T2Z',
  'T3A', 'T3B', 'T3C', 'T3E', 'T3G', 'T3H',   // NW / SW
  'T3J', 'T3K', 'T3L', 'T3M', 'T3N', 'T3P',
  'T3R', 'T3S', 'T3T', 'T3Z',
]);

// Matches any valid Canadian postal code: A1A 1A1 or A1A1A1
const CANADIAN_POSTAL_RE = /^([A-Z]\d[A-Z])\s?\d[A-Z]\d$/i;

/**
 * Returns true if the postal code is a valid Calgary postal code.
 * Accepts both "T2P 1J9" and "T2P1J9" formats.
 */
export function isCalgaryPostal(postalCode: string): boolean {
  const clean = postalCode.trim().toUpperCase();
  const match = CANADIAN_POSTAL_RE.exec(clean);
  if (!match) return false;
  const fsa = match[1].toUpperCase();
  return CALGARY_FSA_PREFIXES.has(fsa);
}

export { CALGARY_FSA_PREFIXES };
