/**
 * One-shot seed Lambda. Deploy, invoke once, then remove.
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { Client } from 'pg';

const SEEDS: Array<{ name: string; sql: string }> = [
  {
    name: '001_admin_user.sql',
    sql: `
INSERT INTO users (id, google_sub, email, full_name, avatar_url, password_hash)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'google-sub-admin-seed',
  'admin@maidlink.local',
  'MaidLink Admin',
  NULL,
  '$2a$10$kr3yorUB9fGE164tcDVMiuNBv91Pa.NpqKt2rpB1hVx8JYKe5.HZi'
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash;

INSERT INTO user_roles (user_id, role)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'ADMIN'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'CUSTOMER')
ON CONFLICT (user_id, role) DO NOTHING;
    `,
  },
  {
    name: '003_grant_admin_sindhuja.sql',
    sql: `
INSERT INTO user_roles (user_id, role)
SELECT id, 'ADMIN' FROM users WHERE email = 'sindhujakalisrinivasan@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
    `,
  },
  {
    name: '004_grant_admin_munivku.sql',
    sql: `
INSERT INTO user_roles (user_id, role)
SELECT id, 'ADMIN' FROM users WHERE email = 'munivku@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
    `,
  },
  {
    name: '002_sample_maids.sql',
    sql: `
INSERT INTO users (id, google_sub, email, full_name)
VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'google-sub-maid-sarah',  'sarah@maidlink.local', 'Sarah Thompson'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'google-sub-maid-maria',  'maria@maidlink.local', 'Maria Gonzalez'),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'google-sub-maid-james',  'james@maidlink.local', 'James Park'),
  ('dddddddd-0000-0000-0000-000000000001', 'google-sub-customer-alice', 'alice@maidlink.local', 'Alice Chen')
ON CONFLICT (email) DO NOTHING;

INSERT INTO user_roles (user_id, role) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'CUSTOMER'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'MAID'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'CUSTOMER'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'MAID'),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'CUSTOMER'),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'MAID'),
  ('dddddddd-0000-0000-0000-000000000001', 'CUSTOMER')
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO maid_profiles (id, user_id, status, bio, hourly_rate, service_area_codes, years_experience, approved_by, approved_at)
VALUES
  ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'APPROVED',
   'Reliable and detail-oriented cleaner with 5 years of experience in residential cleaning. I use eco-friendly products.',
   35.00, ARRAY['T2P','T2R','T2S','T2T'], 5, 'aaaaaaaa-0000-0000-0000-000000000001', NOW()),
  ('cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'APPROVED',
   'Professional deep-cleaning specialist. I bring all my own supplies and am fully insured.',
   42.00, ARRAY['T3A','T3B','T3C','T3E'], 8, 'aaaaaaaa-0000-0000-0000-000000000001', NOW()),
  ('cccccccc-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000003', 'PENDING',
   'New to MaidLink but have 2 years of experience cleaning commercial spaces.',
   28.00, ARRAY['T2N','T2L','T2M'], 2, NULL, NULL)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO availability_recurring (maid_id, day_of_week, start_time, end_time) VALUES
  ('cccccccc-0000-0000-0000-000000000001', 'MON', '08:00', '18:00'),
  ('cccccccc-0000-0000-0000-000000000001', 'TUE', '08:00', '18:00'),
  ('cccccccc-0000-0000-0000-000000000001', 'WED', '08:00', '18:00'),
  ('cccccccc-0000-0000-0000-000000000001', 'THU', '08:00', '18:00'),
  ('cccccccc-0000-0000-0000-000000000001', 'FRI', '08:00', '18:00'),
  ('cccccccc-0000-0000-0000-000000000002', 'SAT', '09:00', '17:00'),
  ('cccccccc-0000-0000-0000-000000000002', 'SUN', '09:00', '17:00')
ON CONFLICT (maid_id, day_of_week, start_time) DO NOTHING;
    `,
  },
];

export const handler = async (): Promise<{ statusCode: number; body: string }> => {
  const results: string[] = [];

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
  results.push('Connected');

  for (const { name, sql } of SEEDS) {
    try {
      await client.query(sql);
      results.push(`SEEDED ${name}`);
    } catch (err) {
      await client.end();
      const msg = err instanceof Error ? err.message : String(err);
      return { statusCode: 500, body: JSON.stringify({ error: msg, results }) };
    }
  }

  await client.end();
  results.push('All seeds complete');
  return { statusCode: 200, body: JSON.stringify({ results }) };
};
