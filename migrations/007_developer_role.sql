-- ============================================================
-- Migración 007: rol Desarrollador y contenidos en pruebas
-- Ejecutar en Supabase SQL Editor
-- No modifica datos existentes. Las columnas nuevas quedan en false.
-- ============================================================

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'users'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('usuario', 'administrador', 'desarrollador'));

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS en_pruebas BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inscription_en_pruebas BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS food_en_pruebas BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS games_en_pruebas BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS snacks_en_pruebas BOOLEAN NOT NULL DEFAULT false;
