-- ============================================================
-- IDJ Backend - Migración inicial
-- Ejecutar en Supabase SQL Editor (o cualquier PostgreSQL)
-- ============================================================

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  apellidos TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  telefono TEXT,
  password TEXT NOT NULL,
  foto TEXT,
  role TEXT NOT NULL DEFAULT 'usuario' CHECK (role IN ('usuario', 'administrador')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de eventos
CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  mes TEXT NOT NULL,
  anio INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de estados de inscripción
CREATE TABLE IF NOT EXISTS inscription_states (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE
);

-- Tabla de inscripciones
CREATE TABLE IF NOT EXISTS inscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  state_id BIGINT NOT NULL REFERENCES inscription_states(id),
  dni TEXT,
  nombre TEXT NOT NULL,
  apellidos TEXT NOT NULL,
  telefono TEXT,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, event_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_inscriptions_user ON inscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_inscriptions_event ON inscriptions(event_id);
CREATE INDEX IF NOT EXISTS idx_inscriptions_state ON inscriptions(state_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Seed: estados de inscripción
INSERT INTO inscription_states (nombre) VALUES
  ('Sin inscribir'),
  ('Pendiente de Confirmación'),
  ('Confirmado - Pdte de Pago'),
  ('Inscrito')
ON CONFLICT (nombre) DO NOTHING;

-- Seed: evento LudoVyP Abril 2027
INSERT INTO events (nombre, mes, anio) VALUES
  ('LudoVyP', 'Abril', 2027);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER inscriptions_updated_at
  BEFORE UPDATE ON inscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Habilitar RLS (Row Level Security) - recomendado en Supabase
-- De momento lo desactivamos porque la autenticación la manejamos con JWT propio
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE inscription_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE inscriptions ENABLE ROW LEVEL SECURITY;

-- Política: permitir todo al service_role (nuestro backend)
CREATE POLICY "Service role full access" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON inscription_states FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON inscriptions FOR ALL USING (true) WITH CHECK (true);
