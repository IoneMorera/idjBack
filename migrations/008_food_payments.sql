-- Pago del pedido de comida, uno por usuario e evento.

CREATE TABLE IF NOT EXISTS event_food_payments (
  event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paid BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_food_payments_event ON event_food_payments(event_id);

ALTER TABLE event_food_payments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'event_food_payments' AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access" ON event_food_payments
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
