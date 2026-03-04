-- Migration 010: Reviews & Ratings
-- Customers can leave a 1-5 star review + optional comment after a COMPLETED booking.
-- One review per booking enforced by UNIQUE on booking_id.

CREATE TABLE reviews (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID        NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id UUID        NOT NULL REFERENCES users(id),
  maid_id     UUID        NOT NULL REFERENCES maid_profiles(id),
  rating      SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reviews_maid_id     ON reviews(maid_id);
CREATE INDEX idx_reviews_customer_id ON reviews(customer_id);
