/**
 * Seed runner.
 * Executes all *.sql files from database/seeds/ in alphabetical order.
 * Seeds are idempotent (all INSERTs use ON CONFLICT DO NOTHING).
 *
 * Usage:
 *   npm run seed
 */

import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

try {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
} catch {
  // no dotenv in prod
}

async function runSeeds(): Promise<void> {
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

  const seedsDir = path.resolve(__dirname, '../seeds');
  const files = fs
    .readdirSync(seedsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const filename of files) {
    const sql = fs.readFileSync(path.join(seedsDir, filename), 'utf-8');
    try {
      await client.query(sql);
      console.log(`  ✅ Seeded ${filename}`);
    } catch (err) {
      console.error(`  ❌ Failed on ${filename}:`, err);
      await client.end();
      process.exit(1);
    }
  }

  console.log('✅ All seeds complete');
  await client.end();
}

runSeeds().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
