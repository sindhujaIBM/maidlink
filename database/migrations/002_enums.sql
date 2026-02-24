CREATE TYPE user_role AS ENUM ('CUSTOMER', 'MAID', 'ADMIN');

CREATE TYPE maid_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- Booking lifecycle: CONFIRMED is the only live state for MVP.
-- PENDING reserved for future async payment flow.
CREATE TYPE booking_status AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED');

CREATE TYPE day_of_week AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');
