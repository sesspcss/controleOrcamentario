const SUPA = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODkwNDQsImV4cCI6MjA5MTM2NTA0NH0.t3tWIh3F9lmg-a6zzdmoKpupHB9i7hTfvFmPyFbZNZs';
const hdrs = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function rpc(name, body) {
  const r = await fetch(`${SUPA}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { ...hdrs, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r.json();
}

async function fetchAll(path, pageSize = 1000) {
  let all = [], offset = 0;
  while (true) {
    const r = await fetch(`${SUPA}/rest/v1/${path}&limit=${pageSize}&offset=${offset}`, {
      headers: { ...hdrs, Prefer: 'count=exact' }
    });
    const data = await r.json();
    all = all.concat(data);
    if (data.length < pageSize) break;
    offset += pageSize;
    if (offset > 50000) break; // safety
  }
  return all;
}

(async () => {
  // 1. Get ALL distinct UG codes using RPC raw SQL approach
  // Use direct REST to get distinct values by fetching groups
  console.log('=== Distinct codigo_ug values (full scan via sampling) ===');
  
  // Sample from different offsets to catch different UGs
  const ugSet = new Set();
  for (let off = 0; off < 465000; off += 10000) {
    const r = await fetch(`${SUPA}/rest/v1/lc131_despesas?select=codigo_ug&limit=500&offset=${off}`, { headers: hdrs });
    const data = await r.json();
    data.forEach(d => ugSet.add(String(d.codigo_ug)));
    if (data.length < 500) break;
  }
  console.log(`Distinct UG codes found: ${ugSet.size}`);
  const ugArr = [...ugSet].sort();
  console.log('UG codes:', ugArr);

  // 2. Check which UGs have match in bd_ref
  const r2 = await fetch(`${SUPA}/rest/v1/bd_ref?select=codigo`, { headers: hdrs });
  const bdrefCodes = (await r2.json()).map(r => r.codigo);
  console.log('\nbd_ref codes:', bdrefCodes);

  // Map UGs to padded codes and check matches
  console.log('\nUG → padded → match in bd_ref:');
  for (const ug of ugArr) {
    const padded = ug.padStart(6, '0');
    const match = bdrefCodes.includes(padded);
    console.log(`  UG ${ug} → ${padded} → ${match ? '✅ MATCH' : '❌ NO MATCH'}`);
  }

  // 3. For unmatched UGs, get a sample row to see what data looks like
  console.log('\n=== Sample rows per UG code ===');
  for (const ug of ugArr) {
    const r = await fetch(`${SUPA}/rest/v1/lc131_despesas?select=codigo_ug,codigo_nome_ug,codigo_projeto_atividade,codigo_nome_projeto_atividade,nome_municipio,tipo_despesa,unidade,regiao_ad&codigo_ug=eq.${ug}&limit=1`, { headers: hdrs });
    const [row] = await r.json();
    if (row) {
      console.log(`\n  UG=${ug}:`);
      console.log(`    codigo_nome_ug: ${row.codigo_nome_ug}`);
      console.log(`    PA: ${row.codigo_projeto_atividade}`);
      console.log(`    PA name: ${(row.codigo_nome_projeto_atividade||'').substring(0,80)}`);
      console.log(`    nome_municipio: ${row.nome_municipio}`);
      console.log(`    tipo_despesa: ${row.tipo_despesa}`);
      console.log(`    unidade: ${row.unidade}`);
      console.log(`    regiao_ad: ${row.regiao_ad}`);
    }
  }

  // 4. Count per UG
  console.log('\n=== Row count per UG ===');
  for (const ug of ugArr) {
    const r = await fetch(`${SUPA}/rest/v1/lc131_despesas?select=id&codigo_ug=eq.${ug}&limit=1`, {
      headers: { ...hdrs, Prefer: 'count=exact' }
    });
    const range = r.headers.get('content-range');
    console.log(`  UG ${ug}: ${range}`);
  }

  // 5. Count per UG where tipo_despesa IS NULL
  console.log('\n=== Rows with tipo_despesa=NULL per UG ===');
  for (const ug of ugArr) {
    const r = await fetch(`${SUPA}/rest/v1/lc131_despesas?select=id&codigo_ug=eq.${ug}&tipo_despesa=is.null&limit=1`, {
      headers: { ...hdrs, Prefer: 'count=exact' }
    });
    const range = r.headers.get('content-range');
    console.log(`  UG ${ug} tipo_despesa NULL: ${range}`);
  }

  // 6. Check distinct codigo_projeto_atividade for unmatched UGs
  console.log('\n=== Distinct PA codes for rows with tipo_despesa=NULL ===');
  const paSet = new Set();
  for (let off = 0; off < 400000; off += 10000) {
    const r = await fetch(`${SUPA}/rest/v1/lc131_despesas?select=codigo_projeto_atividade&tipo_despesa=is.null&limit=500&offset=${off}`, { headers: hdrs });
    const data = await r.json();
    data.forEach(d => paSet.add(String(d.codigo_projeto_atividade)));
    if (data.length < 500) break;
  }
  console.log(`Distinct PA codes with NULL tipo_despesa: ${paSet.size}`);
  console.log('PA codes:', [...paSet].sort());
})();
