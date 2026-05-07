ALTER TABLE estimator_analyses
  ADD COLUMN IF NOT EXISTS admin_feedback JSONB;
