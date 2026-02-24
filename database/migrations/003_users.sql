CREATE TABLE users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub  TEXT        NOT NULL UNIQUE, -- Google OAuth 'sub' claim (immutable per Google account)
  email       TEXT        NOT NULL UNIQUE,
  full_name   TEXT        NOT NULL,
  avatar_url  TEXT,                        -- External Google avatar URL (not S3)
  phone       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email      ON users(email);
CREATE INDEX idx_users_google_sub ON users(google_sub);
