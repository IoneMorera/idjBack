-- ============================================================
-- Migración 013: picoteo dividido en comida y bebida
-- Ejecutar en Supabase SQL Editor
-- ============================================================

ALTER TABLE event_snack_options
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'comida';

ALTER TABLE event_snack_options
  DROP CONSTRAINT IF EXISTS event_snack_options_tipo_check;

ALTER TABLE event_snack_options
  ADD CONSTRAINT event_snack_options_tipo_check CHECK (tipo IN ('comida', 'bebida'));
