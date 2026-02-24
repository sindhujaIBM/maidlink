-- Admin seed user.
-- Default password: Admin@maidlink1  (change via UPDATE users SET password_hash=... in prod)
-- Hash below is bcrypt round-10 of 'Admin@maidlink1'.

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
