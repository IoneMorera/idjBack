-- ============================================================
-- Migración 010: página pública del evento (cabecera y secciones)
-- Ejecutar en Supabase SQL Editor
-- ============================================================

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS public_page JSONB;
