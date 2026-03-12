-- Migration 013: Estimator AI analysis rate-limiting log
-- Used to enforce a daily per-user limit on AI photo analyses.

CREATE TABLE estimator_analyses (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX estimator_analyses_user_day
  ON estimator_analyses (user_id, created_at);
