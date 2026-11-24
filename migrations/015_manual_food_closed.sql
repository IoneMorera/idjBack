-- ============================================================
-- Migración 015: cerrar el pedido de comidas manuales
-- Ejecutar en Supabase SQL Editor
-- ============================================================

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS manual_food_closed BOOLEAN NOT NULL DEFAULT false;
