process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // diag v2

const SUPA_URL = 'https://odnstbeuiojohutoqvvw.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kbnN0YmV1aW9qb2h1dG9xdnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTQ1NzgsImV4cCI6MjA5MDA5MDU3OH0._71Nt-rjs3EvOuDcGcQcPFKug-iDg_dEs38UVLBLJEQ';

const headers = {
  'apikey': SUPA_KEY,
  'Authorization': `Bearer ${SUPA_KEY}`,
  'Content-Type': 'application/json',
};

async function test(name, body = {}) {
  console.log(`\n--- ${name} ---`);
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${name}`, {
      method: 'POST', headers, body: JSON.stringify(body),
    });
    console.log('HTTP', r.status);
    const text = await r.text();
    console.log(text.slice(0, 500));
  } catch (e) {
    console.error('FETCH ERROR:', e.message);
  }
}

// Test 1: Check if MV exists via a simple select
async function checkMV() {
  console.log('\n--- CHECK lc131_mv ---');
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/lc131_mv?select=id&limit=1`, {
      method: 'GET', headers,
    });
    console.log('HTTP', r.status);
    const text = await r.text();
    console.log(text.slice(0, 300));
  } catch (e) {
    console.error('FETCH ERROR:', e.message);
  }
}

// Test 2: Check old view
async function checkView() {
  console.log('\n--- CHECK lc131_enriquecida ---');
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/lc131_enriquecida?select=id&limit=1`, {
      method: 'GET', headers,
    });
    console.log('HTTP', r.status);
    const text = await r.text();
    console.log(text.slice(0, 300));
  } catch (e) {
    console.error('FETCH ERROR:', e.message);
  }
}

// Test 3: Check base table
async function checkBase() {
  console.log('\n--- CHECK lc131_despesas count ---');
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/lc131_despesas?select=id&limit=1`, {
      method: 'GET', headers: { ...headers, 'Prefer': 'count=estimated' },
    });
    console.log('HTTP', r.status, '| count:', r.headers.get('content-range'));
  } catch (e) {
    console.error('FETCH ERROR:', e.message);
  }
}

await checkBase();
await checkMV();
await checkView();
await test('lc131_dashboard');
await test('lc131_distincts');
