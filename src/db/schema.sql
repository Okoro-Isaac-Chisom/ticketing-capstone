-- The database schema. Constraints are the LAST line of defence: even if our
-- JavaScript has a bug, the database refuses data that breaks these rules.

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  role       TEXT NOT NULL CHECK (role IN ('organizer', 'attendee', 'staff')),
  created_at TEXT NOT NULL
);

-- organizer_id and user_id are NOT foreign keys to users yet: until Build 7
-- (login) the caller is only an x-user-id header, so no users rows exist.
CREATE TABLE IF NOT EXISTS events (
  id           TEXT PRIMARY KEY,
  organizer_id TEXT NOT NULL,
  title        TEXT NOT NULL CHECK (length(trim(title)) > 0),
  city         TEXT NOT NULL CHECK (length(trim(city)) > 0),
  venue        TEXT NOT NULL CHECK (length(trim(venue)) > 0),
  starts_at    TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED')),
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket_tiers (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL REFERENCES events (id),
  name        TEXT NOT NULL CHECK (length(trim(name)) > 0),
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),   -- money is whole cents
  capacity    INTEGER NOT NULL CHECK (capacity >= 1),
  sold        INTEGER NOT NULL DEFAULT 0,
  -- The safety net for overselling: sold can never go below 0 or above capacity.
  CHECK (sold >= 0 AND sold <= capacity)
);

CREATE TABLE IF NOT EXISTS bookings (
  id          TEXT PRIMARY KEY,
  reference   TEXT NOT NULL UNIQUE,                         -- no two bookings share a code
  user_id     TEXT NOT NULL,
  event_id    TEXT NOT NULL REFERENCES events (id),
  tier_id     TEXT NOT NULL REFERENCES ticket_tiers (id),
  quantity    INTEGER NOT NULL CHECK (quantity >= 1),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  status      TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded', 'checked_in')),
  charge_id   TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tiers_event ON ticket_tiers (event_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings (user_id);
