-- ============================================================
-- Pedidos de comida por evento
-- ============================================================

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS food_ordering_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS event_food_dishes (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  external_url TEXT NOT NULL,
  name TEXT NOT NULL,
  price NUMERIC(10, 2),
  image_url TEXT,
  category TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, external_url)
);

CREATE INDEX IF NOT EXISTS idx_event_food_dishes_event ON event_food_dishes(event_id);

CREATE TABLE IF NOT EXISTS event_food_order_items (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dish_id BIGINT NOT NULL REFERENCES event_food_dishes(id) ON DELETE CASCADE,
  day TEXT NOT NULL CHECK (day IN ('jueves', 'viernes', 'sabado', 'domingo')),
  meal TEXT NOT NULL CHECK (meal IN ('comida', 'cena')),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, user_id, dish_id, day, meal)
);

CREATE INDEX IF NOT EXISTS idx_food_orders_event ON event_food_order_items(event_id);
CREATE INDEX IF NOT EXISTS idx_food_orders_user ON event_food_order_items(user_id);

CREATE OR REPLACE TRIGGER event_food_order_items_updated_at
  BEFORE UPDATE ON event_food_order_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE event_food_dishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_food_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON event_food_dishes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON event_food_order_items FOR ALL USING (true) WITH CHECK (true);
