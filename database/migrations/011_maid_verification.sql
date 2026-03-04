-- Migration 011: Maid Verification
-- Adds admin-controlled verification flag + ID document storage to maid profiles.
-- is_verified is separate from approval status — a maid can be APPROVED but unverified.

ALTER TABLE maid_profiles
  ADD COLUMN is_verified   BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN id_doc_s3_key TEXT,
  ADD COLUMN verified_by   UUID        REFERENCES users(id),
  ADD COLUMN verified_at   TIMESTAMPTZ;
