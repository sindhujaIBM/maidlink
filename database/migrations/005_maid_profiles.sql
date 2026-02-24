CREATE TABLE maid_profiles (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status            maid_status NOT NULL DEFAULT 'PENDING',
  bio               TEXT,
  hourly_rate       NUMERIC(8,2) NOT NULL CHECK (hourly_rate > 0),
  -- Calgary FSA codes this maid serves, e.g. ['T2P', 'T2R', 'T3A']
  service_area_codes TEXT[]     NOT NULL DEFAULT '{}',
  years_experience  SMALLINT    NOT NULL DEFAULT 0 CHECK (years_experience >= 0),
  photo_s3_key      TEXT,                  -- S3 object key, NOT a full URL
  approved_by       UUID        REFERENCES users(id),
  approved_at       TIMESTAMPTZ,
  rejected_reason   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_maid_profiles_status  ON maid_profiles(status);
CREATE INDEX idx_maid_profiles_user_id ON maid_profiles(user_id);
-- GIN index for fast array containment queries (filter by service area)
CREATE INDEX idx_maid_profiles_service_area ON maid_profiles USING GIN(service_area_codes);
