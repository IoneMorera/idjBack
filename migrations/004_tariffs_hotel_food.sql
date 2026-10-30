-- ============================================================
-- Migración 004: Tarifas del evento + comida gestionada por hotel
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- Flag: comida gestionada por el hotel
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS hotel_food_enabled BOOLEAN NOT NULL DEFAULT false;

-- Tarifas del evento
CREATE TABLE IF NOT EXISTS event_tariffs (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  precio_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_tariffs_event ON event_tariffs(event_id);

-- Conceptos que componen cada tarifa (desglose)
CREATE TABLE IF NOT EXISTS event_tariff_items (
  id BIGSERIAL PRIMARY KEY,
  tariff_id BIGINT NOT NULL REFERENCES event_tariffs(id) ON DELETE CASCADE,
  concepto TEXT NOT NULL,
  importe NUMERIC(10, 2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_event_tariff_items_tariff ON event_tariff_items(tariff_id);

-- RLS
ALTER TABLE event_tariffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_tariff_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON event_tariffs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON event_tariff_items FOR ALL USING (true) WITH CHECK (true);

-- Tipo de inscripción vinculado a tarifa
ALTER TABLE inscriptions ADD COLUMN IF NOT EXISTS tariff_id BIGINT REFERENCES event_tariffs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_inscriptions_tariff ON inscriptions(tariff_id);
