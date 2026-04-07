import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest config for integration tests.
 *
 * Prerequisites: Docker Postgres must be running (`npm run db:up`).
 * Run with: npm run test:integration
 */
export default defineConfig({
  resolve: {
    alias: {
      // Resolve @maidlink/shared to source so no build step is needed
      '@maidlink/shared': path.resolve('./packages/shared/src/index.ts'),
    },
  },
  test: {
    name:        'integration',
    include:     ['tests/integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,

    // Set env vars before any module runs in workers — ensures getPool()
    // connects to local Docker, not Aurora.
    env: {
      DB_HOST:       'localhost',
      DB_PORT:       '5432',
      DB_NAME:       'maidlink',
      DB_USER:       'maidlink_dev',
      DB_PASSWORD:   'devpassword',
      DB_SSL:        'false',
      JWT_SECRET:    'test-secret-integration',
      PHOTOS_BUCKET: 'test-bucket',
      AWS_REGION:    'ca-west-1',
    },

    // Run test files sequentially so cleanup in one file never races with
    // seed inserts in another file (they share the same Docker DB).
    pool:            'forks',
    fileParallelism: false,
  },
});
