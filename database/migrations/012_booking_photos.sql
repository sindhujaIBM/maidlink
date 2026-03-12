-- Migration 012: Add before/after photo keys to bookings
-- before_photo_keys: estimator photos uploaded by customer before booking
-- after_photo_keys:  completion photos uploaded by maid after job is done

ALTER TABLE bookings
  ADD COLUMN before_photo_keys TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN after_photo_keys  TEXT[] NOT NULL DEFAULT '{}';
