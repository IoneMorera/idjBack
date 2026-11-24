-- ============================================================
-- Migración 011: comidas añadidas a mano
-- Ejecutar en Supabase SQL Editor
-- ============================================================

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS manual_food_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_food_en_pruebas BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS event_manual_food_options (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  coste_adicional NUMERIC(10, 2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_manual_food_options_event ON event_manual_food_options(event_id);

CREATE TABLE IF NOT EXISTS event_manual_food_orders (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_id BIGINT NOT NULL REFERENCES event_manual_food_options(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, user_id, option_id)
);

CREATE INDEX IF NOT EXISTS idx_event_manual_food_orders_event ON event_manual_food_orders(event_id);

CREATE TABLE IF NOT EXISTS event_manual_food_requests (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_manual_food_requests_event ON event_manual_food_requests(event_id);

ALTER TABLE event_manual_food_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_manual_food_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_manual_food_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_manual_food_options' AND policyname = 'Service role full access') THEN
    CREATE POLICY "Service role full access" ON event_manual_food_options FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_manual_food_orders' AND policyname = 'Service role full access') THEN
    CREATE POLICY "Service role full access" ON event_manual_food_orders FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_manual_food_requests' AND policyname = 'Service role full access') THEN
    CREATE POLICY "Service role full access" ON event_manual_food_requests FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
