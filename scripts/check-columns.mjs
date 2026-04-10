const url = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODkwNDQsImV4cCI6MjA5MTM2NTA0NH0.t3tWIh3F9lmg-a6zzdmoKpupHB9i7hTfvFmPyFbZNZs';
const h = {apikey:key, Authorization:'Bearer '+key};

async function checkCols(table) {
  const r = await fetch(url+'/rest/v1/'+table+'?limit=1', {headers:h});
  if (!r.ok) { console.log(table+': ERROR '+r.status, await r.text()); return; }
  const data = await r.json();
  if (data.length === 0) { console.log(table+': (empty)'); return; }
  const cols = Object.keys(data[0]);
  console.log(`\n=== ${table} (${cols.length} columns) ===`);
  cols.forEach((c,i) => console.log(`  ${i+1}. ${c}`));
}

(async()=>{
  await checkCols('lc131_despesas');
  await checkCols('bd_ref');
  await checkCols('tab_drs');
  await checkCols('tab_rras');
  await checkCols('lc131_enriquecida');
  
  // Check enrichment status
  const r1 = await fetch(url+'/rest/v1/lc131_despesas?select=id&drs=not.is.null&drs=neq.', {headers:{...h, Prefer:'count=exact', Range:'0-0'}});
  console.log('\n=== Enrichment Status ===');
  console.log('Enriched (drs not null/empty):', r1.headers.get('content-range'));
  
  const r2 = await fetch(url+'/rest/v1/lc131_despesas?select=id&or=(drs.is.null,drs.eq.)', {headers:{...h, Prefer:'count=exact', Range:'0-0'}});
  console.log('Not enriched (drs null/empty):', r2.headers.get('content-range'));
  
  // Sample enriched row
  const r3 = await fetch(url+'/rest/v1/lc131_despesas?select=drs,rras,municipio,rotulo,tipo_despesa&drs=not.is.null&drs=neq.&limit=2', {headers:h});
  console.log('\nSample enriched:', JSON.stringify(await r3.json(), null, 2));
})();
