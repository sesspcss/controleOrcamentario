const SUPA = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODkwNDQsImV4cCI6MjA5MTM2NTA0NH0.t3tWIh3F9lmg-a6zzdmoKpupHB9i7hTfvFmPyFbZNZs';
const hdrs = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function q(path) {
  const r = await fetch(`${SUPA}/rest/v1/${path}`, { headers: { ...hdrs, Prefer: 'count=exact' } });
  const count = r.headers.get('content-range');
  return { data: await r.json(), count };
}

async function rpc(name, body) {
  const r = await fetch(`${SUPA}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { ...hdrs, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r.json();
}

(async () => {
  // 1. Total rows
  const { count: total } = await q('lc131_despesas?select=id&limit=1');
  console.log('Total rows:', total);

  // 2. Check how many rows have each column NULL
  for (const col of ['tipo_despesa','unidade','regiao_ad','regiao_sa','cod_ibge']) {
    const { count } = await q(`lc131_despesas?select=id&${col}=is.null&limit=1`);
    console.log(`  ${col} IS NULL: ${count}`);
  }

  // 3. Check how many have non-null
  for (const col of ['tipo_despesa','unidade','regiao_ad','regiao_sa','cod_ibge']) {
    const { count } = await q(`lc131_despesas?select=id&${col}=not.is.null&limit=1`);
    console.log(`  ${col} NOT NULL: ${count}`);
  }

  // 4. Sample codigo_nome_ug values
  const { data: ugs } = await q('lc131_despesas?select=codigo_nome_ug&limit=20&order=id');
  console.log('\nSample codigo_nome_ug:', ugs.map(r => r.codigo_nome_ug));

  // 5. Distinct DRS values
  const { data: drsVals } = await q('lc131_despesas?select=drs&drs=not.is.null&limit=1000');
  const distinctDrs = [...new Set(drsVals.map(r => r.drs))].sort();
  console.log('\nDistinct DRS values:', distinctDrs);

  // 6. Distinct RRAS values
  const { data: rrasVals } = await q('lc131_despesas?select=rras&rras=not.is.null&limit=1000');
  const distinctRras = [...new Set(rrasVals.map(r => r.rras))].sort();
  console.log('\nDistinct RRAS values:', distinctRras);

  // 7. Sample bd_ref
  const { data: bdref } = await q('bd_ref?select=*&limit=20');
  console.log('\nbd_ref rows:', bdref.length);
  bdref.forEach(r => console.log(`  ${r.codigo}: tipo=${r.tipo_despesa}, unidade=${r.unidade?.substring(0,40)}, regiao_ad=${r.regiao_ad}, regiao_sa=${r.regiao_sa}, cod_ibge=${r.cod_ibge}`));

  // 8. Check tab_drs sample
  const { data: drsTab, count: drsCount } = await q('tab_drs?select=*&limit=10');
  console.log(`\ntab_drs rows: ${drsCount}`);
  drsTab.forEach(r => console.log(`  ${r.municipio} → ${r.drs}`));

  // 9. Sample codigo_nome_projeto_atividade for heuristics
  const { data: projAts } = await q('lc131_despesas?select=codigo_projeto_atividade,codigo_nome_projeto_atividade,codigo_ug,codigo_nome_ug&limit=30&order=id');
  console.log('\nSample projeto/ug codes:');
  projAts.forEach(r => console.log(`  PA=${r.codigo_projeto_atividade} UG=${r.codigo_ug} UG_name=${r.codigo_nome_ug?.substring(0,60)}`));

  // 10. Distinct codigo_ug values count
  const { data: ugDistinct } = await q('lc131_despesas?select=codigo_ug&limit=10000');
  const uniqueUgs = [...new Set(ugDistinct.map(r => r.codigo_ug))];
  console.log(`\nDistinct codigo_ug values (sample up to 10000 rows): ${uniqueUgs.length}`);
  console.log('Sample UGs:', uniqueUgs.slice(0, 30));
})();
