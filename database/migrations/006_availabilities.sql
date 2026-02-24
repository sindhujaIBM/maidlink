-- Weekly recurring availability windows (e.g. every Monday 9am–5pm)
CREATE TABLE availability_recurring (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  maid_id      UUID        NOT NULL REFERENCES maid_profiles(id) ON DELETE CASCADE,
  day_of_week  day_of_week NOT NULL,
  start_time   TIME        NOT NULL,
  end_time     TIME        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_recurring_times CHECK (end_time > start_time),
  UNIQUE (maid_id, day_of_week, start_time)
);

CREATE INDEX idx_avail_recurring_maid ON availability_recurring(maid_id, day_of_week);

-- One-off overrides: add or block specific dates/times
-- is_available = TRUE  → extra available slot not in recurring schedule
-- is_available = FALSE → blocked slot that removes a recurring slot
CREATE TABLE availability_overrides (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  maid_id       UUID    NOT NULL REFERENCES maid_profiles(id) ON DELETE CASCADE,
  override_date DATE    NOT NULL,
  start_time    TIME    NOT NULL,
  end_time      TIME    NOT NULL,
  is_available  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_override_times CHECK (end_time > start_time),
  UNIQUE (maid_id, override_date, start_time)
);

CREATE INDEX idx_avail_overrides_maid_date ON availability_overrides(maid_id, override_date);
