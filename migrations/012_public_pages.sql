-- ============================================================
-- Migración 012: páginas de la web pública construidas por bloques
-- Ejecutar en Supabase SQL Editor
-- Sustituye a la columna events.public_page (migración 010), que deja de usarse.
-- ============================================================

CREATE TABLE IF NOT EXISTS public_pages (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT REFERENCES events(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  published BOOLEAN NOT NULL DEFAULT false,
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_public_pages_event ON public_pages(event_id);
