/**
 * Known Calgary FSA (Forward Sortation Area) codes.
 * Used for the service area picker in maid profile setup.
 */
export const CALGARY_FSA_CODES = [
  'T1Y', 'T1Z',
  'T2A', 'T2B', 'T2C', 'T2E', 'T2G', 'T2H',
  'T2J', 'T2K', 'T2L', 'T2M', 'T2N', 'T2P',
  'T2R', 'T2S', 'T2T', 'T2V', 'T2W', 'T2X',
  'T2Y', 'T2Z',
  'T3A', 'T3B', 'T3C', 'T3E', 'T3G', 'T3H',
  'T3J', 'T3K', 'T3L', 'T3M', 'T3N', 'T3P',
  'T3R', 'T3S', 'T3T', 'T3Z',
] as const;

export type CalgaryFSA = typeof CALGARY_FSA_CODES[number];
