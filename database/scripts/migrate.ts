/**
 * Migration runner.
 * Reads all *.sql files from database/migrations/ in alphabetical order
 * and executes them against the target database.
 *
 * Usage:
 *   npm run migrate                        # uses .env
 *   DB_HOST=... DB_USER=... npm run migrate:prod
 */

import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

// Load .env from repo root if present (local dev)
try {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
} catch {
  // dotenv not installed in CI / production — env vars come from environment
}

async function runMigrations(): Promise<void> {
  const client = new Client({
    host:     process.env.DB_HOST     || 'localhost',
    port:     Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME     || 'maidlink',
    user:     process.env.DB_USER     || 'maidlink_dev',
    password: process.env.DB_PASSWORD || 'devpassword',
    ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  await client.connect();
  console.log('✅ Connected to database');

  // Ensure migrations tracking table exists
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migrationsDir = path.resolve(__dirname, '../migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort(); // alphabetical = chronological given 001_, 002_, ...

  for (const filename of files) {
    // Skip already-applied migrations
    const { rows } = await client.query(
      'SELECT 1 FROM schema_migrations WHERE filename = $1',
      [filename]
    );
    if (rows.length > 0) {
      console.log(`  ⏭  Skipping ${filename} (already applied)`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf-8');
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [filename]
      );
      await client.query('COMMIT');
      console.log(`  ✅ Applied ${filename}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  ❌ Failed on ${filename}:`, err);
      await client.end();
      process.exit(1);
    }
  }

  console.log('✅ All migrations complete');
  await client.end();
}

runMigrations().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
