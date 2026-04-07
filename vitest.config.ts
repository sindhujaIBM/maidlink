import { defineConfig } from 'vitest/config';

/**
 * Root vitest config — applies to ALL workspace projects via vitest.workspace.ts.
 * Excludes integration tests (run separately via `npm run test:integration`)
 * and the pre-compiled dist files from the unit-test runs.
 */
export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'tests/**',
    ],
  },
});
