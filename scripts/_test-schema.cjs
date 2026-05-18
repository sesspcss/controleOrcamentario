'use strict';
const https = require('https');
const token = process.env.SUPABASE_TOKEN || ''; // set via env var before running
const ref = 'teikzwrfsxjipxozzhbr';

function supaQuery(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const opts = {
      hostname: 'api.supabase.com',
      path: '/v1/projects/' + ref + '/database/query',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      }
    };
    const req = https.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, data: d }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  // Get column schema
  const schema = await supaQuery(
    "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='lc131_despesas' ORDER BY ordinal_position"
  );
  console.log('\n=== SCHEMA lc131_despesas ===');
  console.log(JSON.stringify(schema.data, null, 2));

  // Sample row
  const sample = await supaQuery('SELECT * FROM lc131_despesas LIMIT 1');
  console.log('\n=== SAMPLE ROW ===');
  console.log(JSON.stringify(sample.data, null, 2));

  // Row count per year
  const years = await supaQuery('SELECT ano_referencia, COUNT(*) as total FROM lc131_despesas GROUP BY ano_referencia ORDER BY ano_referencia');
  console.log('\n=== ROWS PER YEAR ===');
  console.log(JSON.stringify(years.data, null, 2));
}

main().catch(console.error);
