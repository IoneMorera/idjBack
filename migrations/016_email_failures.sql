-- ============================================================
-- Migración 016: registro de correos automáticos que no se pudieron enviar
-- Ejecutar en Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS email_failures (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT REFERENCES events(id) ON DELETE SET NULL,
  source TEXT NOT NULL,
  email_name TEXT,
  recipient TEXT,
  subject TEXT,
  error TEXT NOT NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_failures_pending_idx
  ON email_failures (created_at DESC)
  WHERE resolved_at IS NULL;
