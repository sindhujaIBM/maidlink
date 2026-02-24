import { Pool } from 'pg';

let pool: Pool | null = null;

/**
 * Returns a singleton pg Pool.
 *
 * Lambda reuse: the Pool persists across warm invocations within the same
 * execution context, so connections are reused. RDS Proxy handles the actual
 * pooling at the database layer, so we keep Lambda-side pool small (max 2).
 *
 * SSL: Aurora requires SSL. For local Docker Postgres, SSL is disabled via DB_SSL=false.
 */
export function getPool(): Pool {
  if (pool) return pool;

  const ssl = process.env.DB_SSL !== 'false'
    ? { rejectUnauthorized: false }  // Aurora uses self-signed cert
    : false;

  pool = new Pool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME     || 'maidlink',
    user:     process.env.DB_USER     || 'maidlink_dev',
    password: process.env.DB_PASSWORD || 'devpassword',
    ssl,
    max:              2,    // Keep small — RDS Proxy manages the real pool
    idleTimeoutMillis: 0,   // Don't close idle connections — Lambda stays warm
    connectionTimeoutMillis: 5000,
  });

  pool.on('error', (err) => {
    console.error('pg pool error:', err);
    // Reset pool on error so next invocation creates a fresh one
    pool = null;
  });

  return pool;
}
