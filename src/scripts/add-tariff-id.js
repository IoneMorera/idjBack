require('dotenv').config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function run() {
  const res = await fetch(`${url}/rest/v1/rpc/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
  });

  // Use the Supabase Management API via the pg endpoint
  const pgUrl = url.replace('.supabase.co', '.supabase.co');
  
  // Try direct SQL via the query endpoint  
  const sqlRes = await fetch(`${pgUrl}/pg/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      query: 'ALTER TABLE inscriptions ADD COLUMN IF NOT EXISTS tariff_id BIGINT REFERENCES event_tariffs(id) ON DELETE SET NULL',
    }),
  });

  console.log('pg/query status:', sqlRes.status);
  if (sqlRes.status !== 200) {
    const text = await sqlRes.text();
    console.log('Response:', text.slice(0, 300));
    console.log('\n--- Please run this SQL in Supabase Dashboard SQL Editor: ---\n');
    console.log('ALTER TABLE inscriptions ADD COLUMN IF NOT EXISTS tariff_id BIGINT REFERENCES event_tariffs(id) ON DELETE SET NULL;');
    console.log('CREATE INDEX IF NOT EXISTS idx_inscriptions_tariff ON inscriptions(tariff_id);');
  } else {
    console.log('Column added successfully!');
  }
}

run().catch(console.error);
