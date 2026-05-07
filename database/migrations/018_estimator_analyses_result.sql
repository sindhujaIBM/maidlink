ALTER TABLE estimator_analyses
  ADD COLUMN home_details  JSONB,
  ADD COLUMN photo_s3_keys TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN result        JSONB;
