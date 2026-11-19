-- Platos que el admin ya ha pedido al proveedor. Esas líneas no se pueden eliminar.

CREATE TABLE IF NOT EXISTS event_food_purchased_dishes (
  event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  dish_id BIGINT NOT NULL REFERENCES event_food_dishes(id) ON DELETE CASCADE,
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, dish_id)
);

CREATE INDEX IF NOT EXISTS idx_food_purchased_event ON event_food_purchased_dishes(event_id);

ALTER TABLE event_food_purchased_dishes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'event_food_purchased_dishes' AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access" ON event_food_purchased_dishes
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
