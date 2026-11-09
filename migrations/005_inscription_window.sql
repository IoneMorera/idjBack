-- ============================================================
-- Migración 005: periodo de inscripción, visibilidad y cupo
-- Ejecutar en Supabase SQL Editor
-- ============================================================

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS inscription_starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS inscription_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS inscriptions_closed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_inscriptions INTEGER;

INSERT INTO inscription_states (nombre) VALUES
  ('Lista de Espera')
ON CONFLICT (nombre) DO NOTHING;
