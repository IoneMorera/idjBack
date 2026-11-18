-- ============================================================
-- Migración 006: habitaciones, juegos (BGG), picoteo y logo
-- Ejecutar en Supabase SQL Editor
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS bgg_username TEXT;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS games_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS snacks_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

CREATE TABLE IF NOT EXISTS event_rooms (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  plazas INTEGER NOT NULL CHECK (plazas >= 1),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_rooms_event ON event_rooms(event_id);

CREATE TABLE IF NOT EXISTS event_room_assignments (
  id BIGSERIAL PRIMARY KEY,
  room_id BIGINT NOT NULL REFERENCES event_rooms(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL CHECK (slot >= 1),
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (room_id, slot)
);

CREATE INDEX IF NOT EXISTS idx_event_room_assignments_room ON event_room_assignments(room_id);
CREATE INDEX IF NOT EXISTS idx_event_room_assignments_user ON event_room_assignments(user_id);

CREATE TABLE IF NOT EXISTS user_bgg_games (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bgg_id TEXT NOT NULL,
  nombre TEXT NOT NULL,
  anio INTEGER,
  image_url TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, bgg_id)
);

CREATE INDEX IF NOT EXISTS idx_user_bgg_games_user ON user_bgg_games(user_id);

CREATE TABLE IF NOT EXISTS event_games (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bgg_id TEXT,
  nombre TEXT NOT NULL,
  anio INTEGER,
  image_url TEXT,
  manual BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_games_event ON event_games(event_id);
CREATE INDEX IF NOT EXISTS idx_event_games_user ON event_games(user_id);

CREATE TABLE IF NOT EXISTS event_game_requests (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bgg_id TEXT,
  nombre TEXT NOT NULL,
  anio INTEGER,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_game_requests_event ON event_game_requests(event_id);

CREATE TABLE IF NOT EXISTS event_snack_options (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  coste_adicional NUMERIC(10, 2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_snack_options_event ON event_snack_options(event_id);

CREATE TABLE IF NOT EXISTS event_snack_orders (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_id BIGINT NOT NULL REFERENCES event_snack_options(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, user_id, option_id)
);

CREATE INDEX IF NOT EXISTS idx_event_snack_orders_event ON event_snack_orders(event_id);

CREATE TABLE IF NOT EXISTS event_snack_requests (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_snack_requests_event ON event_snack_requests(event_id);

ALTER TABLE event_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_room_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_bgg_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_game_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_snack_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_snack_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_snack_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_rooms' AND policyname = 'Service role full access') THEN
    CREATE POLICY "Service role full access" ON event_rooms FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_room_assignments' AND policyname = 'Service role full access') THEN
    CREATE POLICY "Service role full access" ON event_room_assignments FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_bgg_games' AND policyname = 'Service role full access') THEN
    CREATE POLICY "Service role full access" ON user_bgg_games FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_games' AND policyname = 'Service role full access') THEN
    CREATE POLICY "Service role full access" ON event_games FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_game_requests' AND policyname = 'Service role full access') THEN
    CREATE POLICY "Service role full access" ON event_game_requests FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_snack_options' AND policyname = 'Service role full access') THEN
    CREATE POLICY "Service role full access" ON event_snack_options FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_snack_orders' AND policyname = 'Service role full access') THEN
    CREATE POLICY "Service role full access" ON event_snack_orders FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_snack_requests' AND policyname = 'Service role full access') THEN
    CREATE POLICY "Service role full access" ON event_snack_requests FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
