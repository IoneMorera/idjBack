-- ============================================================
-- Migración 017: pagos del cargo extra de picoteo y comidas manuales
-- Ejecutar en Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS event_extra_food_payments (
  event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('snacks', 'manual_food')),
  paid BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id, kind)
);

-- Se activa cuando alguien ya pagado cambia su pedido; el admin lo quita al revisar el importe.
ALTER TABLE event_extra_food_payments
  ADD COLUMN IF NOT EXISTS changed_after_payment BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_extra_food_payments_event ON event_extra_food_payments(event_id, kind);

ALTER TABLE event_extra_food_payments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'event_extra_food_payments' AND policyname = 'Service role full access'
  ) THEN
    CREATE POLICY "Service role full access" ON event_extra_food_payments
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
