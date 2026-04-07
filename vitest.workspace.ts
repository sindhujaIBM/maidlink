import { defineWorkspace } from 'vitest/config';
import path from 'path';

export default defineWorkspace([
  // Shared package — pure TS, Node environment
  {
    test: {
      name: 'shared',
      include: ['packages/shared/src/__tests__/**/*.test.ts'],
      exclude: ['**/node_modules/**', '**/dist/**', 'tests/**'],
      environment: 'node',
    },
  },

  // Booking service unit tests — aliases shared to source so no build step needed
  {
    resolve: {
      alias: {
        '@maidlink/shared': path.resolve('./packages/shared/src/index.ts'),
      },
    },
    test: {
      name: 'booking',
      include: ['services/booking/src/__tests__/**/*.unit.test.ts'],
      exclude: ['**/node_modules/**', '**/dist/**', 'tests/**'],
      environment: 'node',
    },
  },

  // Frontend — Node for Phase 1 pure-function tests (jsdom added in Phase 4)
  {
    test: {
      name: 'frontend',
      include: ['frontend/src/__tests__/**/*.test.ts'],
      exclude: ['**/node_modules/**', '**/dist/**', 'tests/**'],
      environment: 'node',
    },
  },
]);
