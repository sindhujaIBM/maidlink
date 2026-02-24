-- ─── Bookings ───────────────────────────────────────────────────────────────
-- The EXCLUDE constraint is the cornerstone of the no-overbooking guarantee.
-- It uses the btree_gist extension (enabled in 001) and the TSTZRANGE type
-- to enforce at the database level that no two non-cancelled bookings for
-- the same maid can overlap in time. This fires even if the application
-- logic fails or someone writes to the DB directly.
--
-- Concurrency strategy (belt-and-suspenders):
--   1. Application: SELECT ... FOR UPDATE on maid_profiles row before INSERT
--      → serializes all concurrent booking attempts for one maid
--   2. Database:    EXCLUDE USING GIST (no_maid_overlap)
--      → catches any race that slips through application logic
--
CREATE TABLE bookings (
  id            UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   UUID           NOT NULL REFERENCES users(id),
  maid_id       UUID           NOT NULL REFERENCES maid_profiles(id),
  status        booking_status NOT NULL DEFAULT 'CONFIRMED',

  -- TSTZRANGE stores [start, end) with timezone.
  -- Example: '[2024-06-01 10:00:00+00, 2024-06-01 13:00:00+00)'
  during        TSTZRANGE      NOT NULL,

  address_line1 TEXT           NOT NULL,
  address_line2 TEXT,
  city          TEXT           NOT NULL DEFAULT 'Calgary',
  postal_code   TEXT           NOT NULL,
  notes         TEXT,

  -- Pre-calculated at booking time. hourly_rate * hours, rounded to 2dp.
  total_price   NUMERIC(10,2)  NOT NULL CHECK (total_price > 0),

  created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  -- Hard constraint: no two active (non-cancelled) bookings for the same maid
  -- can overlap in time. Attempting to insert a conflicting booking raises
  -- PostgreSQL error code 23P01 (exclusion_violation).
  CONSTRAINT no_maid_overlap EXCLUDE USING GIST (
    maid_id WITH =,
    during  WITH &&
  ) WHERE (status != 'CANCELLED')
);

CREATE INDEX idx_bookings_customer    ON bookings(customer_id);
CREATE INDEX idx_bookings_maid        ON bookings(maid_id);
CREATE INDEX idx_bookings_status      ON bookings(status);
-- GiST index for time range queries
CREATE INDEX idx_bookings_maid_during ON bookings USING GIST (maid_id, during);
