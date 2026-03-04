/**
 * One-shot migration Lambda.
 * Deploy, invoke once, then remove with: npx serverless remove --stage prod
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { Client } from 'pg';

const MIGRATIONS: Array<{ name: string; sql: string }> = [
  {
    name: '001_extensions.sql',
    sql: `
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    `,
  },
  {
    name: '002_enums.sql',
    sql: `
CREATE TYPE user_role AS ENUM ('CUSTOMER', 'MAID', 'ADMIN');
CREATE TYPE maid_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');
CREATE TYPE booking_status AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED');
CREATE TYPE day_of_week AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');
    `,
  },
  {
    name: '003_users.sql',
    sql: `
CREATE TABLE users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub  TEXT        NOT NULL UNIQUE,
  email       TEXT        NOT NULL UNIQUE,
  full_name   TEXT        NOT NULL,
  avatar_url  TEXT,
  phone       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_email      ON users(email);
CREATE INDEX idx_users_google_sub ON users(google_sub);
    `,
  },
  {
    name: '004_user_roles.sql',
    sql: `
CREATE TABLE user_roles (
  user_id    UUID      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       user_role NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role)
);
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
    `,
  },
  {
    name: '005_maid_profiles.sql',
    sql: `
CREATE TABLE maid_profiles (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status            maid_status NOT NULL DEFAULT 'PENDING',
  bio               TEXT,
  hourly_rate       NUMERIC(8,2) NOT NULL CHECK (hourly_rate > 0),
  service_area_codes TEXT[]     NOT NULL DEFAULT '{}',
  years_experience  SMALLINT    NOT NULL DEFAULT 0 CHECK (years_experience >= 0),
  photo_s3_key      TEXT,
  approved_by       UUID        REFERENCES users(id),
  approved_at       TIMESTAMPTZ,
  rejected_reason   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_maid_profiles_status     ON maid_profiles(status);
CREATE INDEX idx_maid_profiles_user_id    ON maid_profiles(user_id);
CREATE INDEX idx_maid_profiles_service_area ON maid_profiles USING GIN(service_area_codes);
    `,
  },
  {
    name: '006_availabilities.sql',
    sql: `
CREATE TABLE availability_recurring (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  maid_id      UUID        NOT NULL REFERENCES maid_profiles(id) ON DELETE CASCADE,
  day_of_week  day_of_week NOT NULL,
  start_time   TIME        NOT NULL,
  end_time     TIME        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_recurring_times CHECK (end_time > start_time),
  UNIQUE (maid_id, day_of_week, start_time)
);
CREATE INDEX idx_avail_recurring_maid ON availability_recurring(maid_id, day_of_week);

CREATE TABLE availability_overrides (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  maid_id       UUID    NOT NULL REFERENCES maid_profiles(id) ON DELETE CASCADE,
  override_date DATE    NOT NULL,
  start_time    TIME    NOT NULL,
  end_time      TIME    NOT NULL,
  is_available  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_override_times CHECK (end_time > start_time),
  UNIQUE (maid_id, override_date, start_time)
);
CREATE INDEX idx_avail_overrides_maid_date ON availability_overrides(maid_id, override_date);
    `,
  },
  {
    name: '007_bookings.sql',
    sql: `
CREATE TABLE bookings (
  id            UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   UUID           NOT NULL REFERENCES users(id),
  maid_id       UUID           NOT NULL REFERENCES maid_profiles(id),
  status        booking_status NOT NULL DEFAULT 'CONFIRMED',
  during        TSTZRANGE      NOT NULL,
  address_line1 TEXT           NOT NULL,
  address_line2 TEXT,
  city          TEXT           NOT NULL DEFAULT 'Calgary',
  postal_code   TEXT           NOT NULL,
  notes         TEXT,
  total_price   NUMERIC(10,2)  NOT NULL CHECK (total_price > 0),
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  CONSTRAINT no_maid_overlap EXCLUDE USING GIST (
    maid_id WITH =,
    during  WITH &&
  ) WHERE (status != 'CANCELLED')
);
CREATE INDEX idx_bookings_customer    ON bookings(customer_id);
CREATE INDEX idx_bookings_maid        ON bookings(maid_id);
CREATE INDEX idx_bookings_status      ON bookings(status);
CREATE INDEX idx_bookings_maid_during ON bookings USING GIST (maid_id, during);
    `,
  },
  {
    name: '008_updated_at_trigger.sql',
    sql: `
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_maid_profiles_updated_at
  BEFORE UPDATE ON maid_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `,
  },
  {
    name: '009_admin_password.sql',
    sql: `
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
    `,
  },
  {
    name: '010_reviews.sql',
    sql: `
CREATE TABLE reviews (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID        NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id UUID        NOT NULL REFERENCES users(id),
  maid_id     UUID        NOT NULL REFERENCES maid_profiles(id),
  rating      SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_reviews_maid_id     ON reviews(maid_id);
CREATE INDEX idx_reviews_customer_id ON reviews(customer_id);
    `,
  },
  {
    name: '011_maid_verification.sql',
    sql: `
ALTER TABLE maid_profiles
  ADD COLUMN is_verified   BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN id_doc_s3_key TEXT,
  ADD COLUMN verified_by   UUID        REFERENCES users(id),
  ADD COLUMN verified_at   TIMESTAMPTZ;
    `,
  },
];

export const handler = async (): Promise<{ statusCode: number; body: string }> => {
  const results: string[] = [];

  // Fetch DB credentials from Secrets Manager
  const sm = new SecretsManagerClient({ region: 'ca-west-1' });
  const secret = await sm.send(
    new GetSecretValueCommand({ SecretId: '/maidlink/prod/rds-credentials' })
  );
  const creds = JSON.parse(secret.SecretString!);

  const client = new Client({
    host:     process.env.DB_HOST || 'localhost',
    port:     5432,
    database: 'maidlink',
    user:     creds.username,
    password: creds.password,
    ssl:      { rejectUnauthorized: false },
  });

  await client.connect();
  results.push('Connected to database');

  // Ensure tracking table exists
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const { name, sql } of MIGRATIONS) {
    const { rows } = await client.query(
      'SELECT 1 FROM schema_migrations WHERE filename = $1',
      [name]
    );
    if (rows.length > 0) {
      results.push(`SKIP  ${name}`);
      continue;
    }
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [name]);
      await client.query('COMMIT');
      results.push(`APPLY ${name}`);
    } catch (err) {
      await client.query('ROLLBACK');
      await client.end();
      const msg = err instanceof Error ? err.message : String(err);
      return { statusCode: 500, body: JSON.stringify({ error: msg, results }) };
    }
  }

  await client.end();
  results.push('All migrations complete');
  return { statusCode: 200, body: JSON.stringify({ results }) };
};
