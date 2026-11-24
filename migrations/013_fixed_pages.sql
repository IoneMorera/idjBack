-- ============================================================
-- Migración 013: páginas fijas (inicio, LudoVyp 2026, Jueganzo) en el constructor
-- Ejecutar en Supabase SQL Editor después de la 012
-- El backend crea su contenido inicial la primera vez que se abre el constructor.
-- ============================================================

ALTER TABLE public_pages
  ADD COLUMN IF NOT EXISTS route_path TEXT UNIQUE;
