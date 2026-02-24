-- Three sample approved maids for local development / demos.
-- Use these to test the customer browse + booking flow without waiting for admin approval.

-- Maid 1: Sarah
INSERT INTO users (id, google_sub, email, full_name)
VALUES (
  'bbbbbbbb-0000-0000-0000-000000000001',
  'google-sub-maid-sarah',
  'sarah@maidlink.local',
  'Sarah Thompson'
) ON CONFLICT (email) DO NOTHING;

INSERT INTO user_roles (user_id, role)
VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'CUSTOMER'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'MAID')
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO maid_profiles (id, user_id, status, bio, hourly_rate, service_area_codes, years_experience, approved_by, approved_at)
VALUES (
  'cccccccc-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000001',
  'APPROVED',
  'Reliable and detail-oriented cleaner with 5 years of experience in residential cleaning. I use eco-friendly products.',
  35.00,
  ARRAY['T2P', 'T2R', 'T2S', 'T2T'],
  5,
  'aaaaaaaa-0000-0000-0000-000000000001',
  NOW()
) ON CONFLICT (user_id) DO NOTHING;

-- Sarah's recurring availability: Mon–Fri 8am–6pm
INSERT INTO availability_recurring (maid_id, day_of_week, start_time, end_time)
VALUES
  ('cccccccc-0000-0000-0000-000000000001', 'MON', '08:00', '18:00'),
  ('cccccccc-0000-0000-0000-000000000001', 'TUE', '08:00', '18:00'),
  ('cccccccc-0000-0000-0000-000000000001', 'WED', '08:00', '18:00'),
  ('cccccccc-0000-0000-0000-000000000001', 'THU', '08:00', '18:00'),
  ('cccccccc-0000-0000-0000-000000000001', 'FRI', '08:00', '18:00')
ON CONFLICT (maid_id, day_of_week, start_time) DO NOTHING;

-- Maid 2: Maria
INSERT INTO users (id, google_sub, email, full_name)
VALUES (
  'bbbbbbbb-0000-0000-0000-000000000002',
  'google-sub-maid-maria',
  'maria@maidlink.local',
  'Maria Gonzalez'
) ON CONFLICT (email) DO NOTHING;

INSERT INTO user_roles (user_id, role)
VALUES
  ('bbbbbbbb-0000-0000-0000-000000000002', 'CUSTOMER'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'MAID')
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO maid_profiles (id, user_id, status, bio, hourly_rate, service_area_codes, years_experience, approved_by, approved_at)
VALUES (
  'cccccccc-0000-0000-0000-000000000002',
  'bbbbbbbb-0000-0000-0000-000000000002',
  'APPROVED',
  'Professional deep-cleaning specialist. I bring all my own supplies and am fully insured.',
  42.00,
  ARRAY['T3A', 'T3B', 'T3C', 'T3E'],
  8,
  'aaaaaaaa-0000-0000-0000-000000000001',
  NOW()
) ON CONFLICT (user_id) DO NOTHING;

-- Maria's availability: Weekends only
INSERT INTO availability_recurring (maid_id, day_of_week, start_time, end_time)
VALUES
  ('cccccccc-0000-0000-0000-000000000002', 'SAT', '09:00', '17:00'),
  ('cccccccc-0000-0000-0000-000000000002', 'SUN', '09:00', '17:00')
ON CONFLICT (maid_id, day_of_week, start_time) DO NOTHING;

-- Maid 3: James (pending — for admin approval flow testing)
INSERT INTO users (id, google_sub, email, full_name)
VALUES (
  'bbbbbbbb-0000-0000-0000-000000000003',
  'google-sub-maid-james',
  'james@maidlink.local',
  'James Park'
) ON CONFLICT (email) DO NOTHING;

INSERT INTO user_roles (user_id, role)
VALUES
  ('bbbbbbbb-0000-0000-0000-000000000003', 'CUSTOMER'),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'MAID')
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO maid_profiles (id, user_id, status, bio, hourly_rate, service_area_codes, years_experience)
VALUES (
  'cccccccc-0000-0000-0000-000000000003',
  'bbbbbbbb-0000-0000-0000-000000000003',
  'PENDING',
  'New to MaidLink but have 2 years of experience cleaning commercial spaces.',
  28.00,
  ARRAY['T2N', 'T2L', 'T2M'],
  2
) ON CONFLICT (user_id) DO NOTHING;

-- Sample customer user
INSERT INTO users (id, google_sub, email, full_name)
VALUES (
  'dddddddd-0000-0000-0000-000000000001',
  'google-sub-customer-alice',
  'alice@maidlink.local',
  'Alice Chen'
) ON CONFLICT (email) DO NOTHING;

INSERT INTO user_roles (user_id, role)
VALUES ('dddddddd-0000-0000-0000-000000000001', 'CUSTOMER')
ON CONFLICT (user_id, role) DO NOTHING;
