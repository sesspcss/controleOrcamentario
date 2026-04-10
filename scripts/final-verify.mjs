const url = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODkwNDQsImV4cCI6MjA5MTM2NTA0NH0.t3tWIh3F9lmg-a6zzdmoKpupHB9i7hTfvFmPyFbZNZs';
const h = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
const hGet = { apikey: key, Authorization: 'Bearer ' + key };

async function count(filter) {
  const r = await fetch(`${url}/rest/v1/lc131_despesas?select=id&${filter}&limit=0`, {
    headers: { ...hGet, Prefer: 'count=exact', Range: '0-0' }
  });
  const range = r.headers.get('content-range');
  const m = range?.match(/\/(\d+)/);
  return m ? parseInt(m[1]) : -1;
}

(async () => {
  console.log('=== VERIFICAÇÃO COMPLETA ===\n');

  // 1. Enrichment status
  const enriched = await count('drs=not.is.null&drs=neq.');
  const notEnriched = await count('or=(drs.is.null,drs.eq.)');
  console.log(`Enrichment: ${enriched} enriched, ${notEnriched} pending`);

  // 2. Check key columns
  for (const col of ['drs', 'rras', 'municipio', 'rotulo', 'tipo_despesa', 'grupo_despesa', 'cod_ibge', 'unidade']) {
    const c = await count(`${col}=not.is.null&${col}=neq.`);
    console.log(`  ${col.padEnd(20)}: ${c}`);
  }

  // 3. Sample enriched row
  console.log('\n=== Sample enriched row ===');
  const r1 = await fetch(`${url}/rest/v1/lc131_despesas?select=drs,rras,municipio,rotulo,tipo_despesa,grupo_despesa,cod_ibge,unidade&drs=not.is.null&drs=neq.&limit=2`, { headers: hGet });
  if (r1.ok) console.log(JSON.stringify(await r1.json(), null, 2));
  else console.log('FAILED:', r1.status);

  // 4. Dashboard RPC test
  console.log('\n=== Dashboard RPC test ===');
  for (const ano of [2022, 2023, 2024, 2025, 2026]) {
    const r = await fetch(`${url}/rest/v1/rpc/lc131_dashboard`, {
      method: 'POST', headers: h, body: JSON.stringify({ p_ano: ano })
    });
    if (r.ok) {
      const d = await r.json();
      const k = d.kpis;
      console.log(`${ano}: ${k.total} rows, ${(k.empenhado/1e9).toFixed(1)}B emp, ${k.municipios} munic, drs=${(d.por_drs||[]).length}`);
    } else {
      console.log(`${ano}: ERROR ${r.status}`);
    }
  }

  // 5. Lock check
  console.log('\n=== Lock check ===');
  const r2 = await fetch(`${url}/rest/v1/rpc/refresh_dashboard_batch`, {
    method: 'POST', headers: h, body: JSON.stringify({ p_batch_size: 1 })
  });
  const txt = await r2.text();
  console.log(`refresh_dashboard_batch(1): ${r2.status} -> ${txt.substring(0, 100)}`);

  // 6. Column comments check
  console.log('\n=== Column labels (via REST) ===');
  const r3 = await fetch(`${url}/rest/v1/tab_drs?limit=1`, { headers: hGet });
  if (r3.ok) {
    const d = await r3.json();
    console.log('tab_drs columns:', Object.keys(d[0] || {}));
  }

  console.log('\n✅ Verificação concluída');
})();
