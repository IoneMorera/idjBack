require('dotenv').config();

const sql = `
ALTER TABLE events ADD COLUMN IF NOT EXISTS hotel_food_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS event_tariffs (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  precio_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_tariffs_event ON event_tariffs(event_id);

CREATE TABLE IF NOT EXISTS event_tariff_items (
  id BIGSERIAL PRIMARY KEY,
  tariff_id BIGINT NOT NULL REFERENCES event_tariffs(id) ON DELETE CASCADE,
  concepto TEXT NOT NULL,
  importe NUMERIC(10, 2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_event_tariff_items_tariff ON event_tariff_items(tariff_id);

ALTER TABLE event_tariffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_tariff_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_tariffs' AND policyname = 'Service role full access') THEN
    CREATE POLICY "Service role full access" ON event_tariffs FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'event_tariff_items' AND policyname = 'Service role full access') THEN
    CREATE POLICY "Service role full access" ON event_tariff_items FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
`;

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function run() {
  // Try the SQL Editor endpoint
  const res = await fetch(url + '/rest/v1/rpc/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: 'Bearer ' + key,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ name: 'exec_sql', args: { sql } }),
  });
  
  const text = await res.text();
  console.log('Status:', res.status, text.slice(0, 500));
  
  if (res.status >= 400) {
    // The exec_sql function may not exist. 
    // We need to run statements individually via supabase-js
    console.log('\nFallback: running statements via supabase-js...');
    const supabase = require('../database');
    
    // Test if column already exists
    const { data, error } = await supabase.from('events').select('hotel_food_enabled').limit(1);
    if (error && error.message.includes('does not exist')) {
      console.log('Column hotel_food_enabled does not exist - please run the SQL in Supabase Dashboard.');
      console.log('\nSQL to run:\n');
      console.log(sql);
    } else {
      console.log('Column hotel_food_enabled already exists');
    }
    
    // Test tariffs table
    const { error: tariffErr } = await supabase.from('event_tariffs').select('id').limit(1);
    if (tariffErr) {
      console.log('Table event_tariffs does not exist - please run the SQL in Supabase Dashboard.');
    } else {
      console.log('Table event_tariffs already exists');
    }
  }
}

run().catch(console.error);
