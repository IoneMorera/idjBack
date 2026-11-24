-- ============================================================
-- Migración 012: fecha de inicio y fin del evento
-- Ejecutar en Supabase SQL Editor
-- ============================================================

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS starts_on DATE,
  ADD COLUMN IF NOT EXISTS ends_on DATE;
