-- ============================================================
-- IDJ Backend - Migración 002: Formularios dinámicos de inscripción
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- Bloques del formulario de inscripción (agrupan campos)
CREATE TABLE IF NOT EXISTS form_blocks (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Campos dentro de cada bloque
-- field_type: text, textarea, select, radio, checkbox, date
CREATE TABLE IF NOT EXISTS form_fields (
  id BIGSERIAL PRIMARY KEY,
  block_id BIGINT NOT NULL REFERENCES form_blocks(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'textarea', 'select', 'radio', 'checkbox', 'date')),
  required BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Opciones para campos de tipo select, radio, checkbox
CREATE TABLE IF NOT EXISTS form_field_options (
  id BIGSERIAL PRIMARY KEY,
  field_id BIGINT NOT NULL REFERENCES form_fields(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Valores rellenados por el usuario al inscribirse
CREATE TABLE IF NOT EXISTS inscription_field_values (
  id BIGSERIAL PRIMARY KEY,
  inscription_id BIGINT NOT NULL REFERENCES inscriptions(id) ON DELETE CASCADE,
  field_id BIGINT NOT NULL REFERENCES form_fields(id) ON DELETE CASCADE,
  value TEXT,
  UNIQUE(inscription_id, field_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_form_blocks_event ON form_blocks(event_id);
CREATE INDEX IF NOT EXISTS idx_form_fields_block ON form_fields(block_id);
CREATE INDEX IF NOT EXISTS idx_form_field_options_field ON form_field_options(field_id);
CREATE INDEX IF NOT EXISTS idx_inscription_field_values_inscription ON inscription_field_values(inscription_id);
CREATE INDEX IF NOT EXISTS idx_inscription_field_values_field ON inscription_field_values(field_id);

-- RLS policies
ALTER TABLE form_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_field_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE inscription_field_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON form_blocks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON form_fields FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON form_field_options FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON inscription_field_values FOR ALL USING (true) WITH CHECK (true);
