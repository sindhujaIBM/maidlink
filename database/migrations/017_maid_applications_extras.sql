ALTER TABLE maid_applications
  ADD COLUMN can_drive      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN offers_cooking BOOLEAN NOT NULL DEFAULT false;
