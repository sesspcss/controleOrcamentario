const url = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODkwNDQsImV4cCI6MjA5MTM2NTA0NH0.t3tWIh3F9lmg-a6zzdmoKpupHB9i7hTfvFmPyFbZNZs';
const h = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };

(async () => {
  // 1. Check tab_rras sample data
  console.log('=== tab_rras sample ===');
  const r1 = await fetch(`${url}/rest/v1/tab_rras?limit=10`, { headers: h });
  console.log(JSON.stringify(await r1.json(), null, 2));

  // 2. Check tab_drs sample data
  console.log('\n=== tab_drs sample ===');
  const r2 = await fetch(`${url}/rest/v1/tab_drs?limit=5`, { headers: h });
  console.log(JSON.stringify(await r2.json(), null, 2));

  // 3. Check bd_ref sample - especially rras, cod_ibge, grupo_despesa values
  console.log('\n=== bd_ref sample (rras, cod_ibge, grupo_despesa) ===');
  const r3 = await fetch(`${url}/rest/v1/bd_ref?select=codigo,rras,cod_ibge,grupo_despesa,fonte_recurso&limit=5`, { headers: h });
  console.log(JSON.stringify(await r3.json(), null, 2));

  // 4. Check lc131_despesas sample - nome_municipio and municipio values
  console.log('\n=== lc131_despesas sample (nome_municipio, municipio) ===');
  const r4 = await fetch(`${url}/rest/v1/lc131_despesas?select=nome_municipio,municipio,drs,rras,cod_ibge,grupo_despesa,rotulo,tipo_despesa,unidade&limit=5`, { headers: h });
  console.log(JSON.stringify(await r4.json(), null, 2));

  // 5. Check how many distinct nome_municipio values there are
  console.log('\n=== Distinct nome_municipio (first 10) ===');
  const r5 = await fetch(`${url}/rest/v1/lc131_despesas?select=nome_municipio&order=nome_municipio&limit=10`, { headers: h });
  const d5 = await r5.json();
  const unique5 = [...new Set(d5.map(r => r.nome_municipio))];
  console.log(unique5);

  // 6. Check if norm_munic matches between tables
  console.log('\n=== Test: Does norm_munic work? ===');
  // Just check if lc131_despesas municipio values appear in tab_rras
  const r6 = await fetch(`${url}/rest/v1/tab_rras?select=municipio,rras&limit=5`, { headers: h });
  const rrasData = await r6.json();
  console.log('tab_rras format:', rrasData.map(r => r.municipio));

  // 7. Check one specific match
  if (rrasData.length > 0) {
    const testMunic = rrasData[0].municipio; // e.g. "ADAMANTINA"
    console.log(`\nLooking for "${testMunic}" in lc131_despesas.nome_municipio:`);
    const r7 = await fetch(`${url}/rest/v1/lc131_despesas?select=nome_municipio,municipio,drs,rras&nome_municipio=ilike.*${testMunic}*&limit=3`, { headers: h });
    console.log(JSON.stringify(await r7.json(), null, 2));
  }

  // 8. Check drs actual values (what format?)
  console.log('\n=== DRS actual values in lc131_despesas ===');
  const r8 = await fetch(`${url}/rest/v1/lc131_despesas?select=drs&drs=not.is.null&drs=neq.&order=drs&limit=10`, { headers: h });
  if (r8.ok) {
    const drsData = await r8.json();
    const unique8 = [...new Set(drsData.map(r => r.drs))];
    console.log('DRS values:', unique8);
  } else {
    console.log('DRS query failed (timeout?):', r8.status);
  }
})();
