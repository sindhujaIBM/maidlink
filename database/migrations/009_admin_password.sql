-- Nullable password hash for admin (and any future) password-based logins.
-- Google-OAuth-only users leave this NULL.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
