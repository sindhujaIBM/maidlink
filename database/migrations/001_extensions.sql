-- Required for TSRANGE EXCLUDE constraint on bookings table.
-- Must be run as superuser (RDS master user handles this automatically).
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
