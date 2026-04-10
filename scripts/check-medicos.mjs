const url = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODkwNDQsImV4cCI6MjA5MTM2NTA0NH0.t3tWIh3F9lmg-a6zzdmoKpupHB9i7hTfvFmPyFbZNZs';
const h = { apikey: key, Authorization: 'Bearer ' + key };

(async () => {
  // Try to select "medicos" column from each table
  for (const table of ['lc131_despesas', 'bd_ref', 'tab_drs', 'tab_rras']) {
    const r = await fetch(`${url}/rest/v1/${table}?select=medicos&limit=1`, { headers: h });
    const text = await r.text();
    console.log(`${table}.medicos: ${r.status} - ${text.substring(0, 200)}`);
  }

  // Also try "médicos" (with accent) 
  for (const table of ['lc131_despesas', 'bd_ref', 'tab_drs', 'tab_rras']) {
    const r = await fetch(`${url}/rest/v1/${table}?select=m%C3%A9dicos&limit=1`, { headers: h });
    const text = await r.text();
    console.log(`${table}.médicos: ${r.status} - ${text.substring(0, 200)}`);
  }

  // Check if DRS column actually has data
  console.log('\n=== DRS column data check ===');
  for (const table of ['tab_drs', 'bd_ref']) {
    const r = await fetch(`${url}/rest/v1/${table}?select=drs&limit=3`, { headers: h });
    console.log(`${table}.drs:`, JSON.stringify(await r.json()));
  }
  
  // Check if lc131_despesas has any enriched drs data
  const r = await fetch(`${url}/rest/v1/lc131_despesas?select=drs&drs=not.is.null&drs=neq.&limit=3`, { headers: h });
  if (r.ok) {
    const data = await r.json();
    console.log('lc131_despesas enriched drs:', JSON.stringify(data));
  } else {
    console.log('lc131_despesas enriched drs query:', r.status, await r.text());
  }
  
  // Check tab_drs fully
  const r2 = await fetch(`${url}/rest/v1/tab_drs?select=*&limit=5`, { headers: h });
  console.log('\ntab_drs sample:', JSON.stringify(await r2.json(), null, 2));

  // Check bd_ref columns closely
  const r3 = await fetch(`${url}/rest/v1/bd_ref?limit=1`, { headers: h });
  const bd = await r3.json();
  console.log('\nbd_ref all columns:', Object.keys(bd[0] || {}));
  console.log('bd_ref sample:', JSON.stringify(bd[0], null, 2));
})();
