CREATE TABLE maid_applications (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name         TEXT        NOT NULL,
  email             TEXT        NOT NULL,
  phone             TEXT        NOT NULL,
  gender            TEXT        NOT NULL,
  age               INTEGER     NOT NULL,
  work_eligibility  TEXT        NOT NULL,
  years_experience  INTEGER     NOT NULL DEFAULT 0,
  bio               TEXT,
  hourly_rate_pref  NUMERIC(8,2),
  has_own_supplies  BOOLEAN     NOT NULL DEFAULT false,
  languages         TEXT[]      NOT NULL DEFAULT '{}',
  availability      TEXT        NOT NULL,
  photo_s3_key      TEXT,
  id_doc_s3_key     TEXT,
  referral_source   TEXT,
  status            TEXT        NOT NULL DEFAULT 'new',
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_maid_applications_email  ON maid_applications(email);
CREATE INDEX idx_maid_applications_status ON maid_applications(status);
