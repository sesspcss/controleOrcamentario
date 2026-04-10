const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kbnN0YmV1aW9qb2h1dG9xdnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTQ1NzgsImV4cCI6MjA5MDA5MDU3OH0._71Nt-rjs3EvOuDcGcQcPFKug-iDg_dEs38UVLBLJEQ';
const BASE = 'https://odnstbeuiojohutoqvvw.supabase.co';
const h = { apikey: KEY, Authorization: `Bearer ${KEY}` };

console.log('Testing simple query (120s timeout)...');
const t = Date.now();
try {
  const r = await fetch(`${BASE}/rest/v1/lc131_despesas?select=id,descricao_processo,numero_processo&order=id.desc&limit=3`, { headers: h, signal: AbortSignal.timeout(120000) });
  const body = await r.text();
  console.log(`Status: ${r.status} (${Date.now()-t}ms)`);
  console.log(body.substring(0, 500));
} catch(e) { console.log(`Failed: ${e.message} (${Date.now()-t}ms)`); }
