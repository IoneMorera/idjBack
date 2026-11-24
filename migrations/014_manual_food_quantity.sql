-- ============================================================
-- Migración 014: cantidad en comidas manuales
-- Ejecutar en Supabase SQL Editor
-- ============================================================

ALTER TABLE event_manual_food_orders
  ADD COLUMN IF NOT EXISTS cantidad INTEGER NOT NULL DEFAULT 1;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_manual_food_orders_cantidad_check'
  ) THEN
    ALTER TABLE event_manual_food_orders
      ADD CONSTRAINT event_manual_food_orders_cantidad_check CHECK (cantidad >= 1);
  END IF;
END $$;
