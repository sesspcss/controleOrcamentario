const url = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODkwNDQsImV4cCI6MjA5MTM2NTA0NH0.t3tWIh3F9lmg-a6zzdmoKpupHB9i7hTfvFmPyFbZNZs';
const h = { apikey: key, Authorization: 'Bearer ' + key };

(async () => {
  // Get OpenAPI spec to list all tables
  const r = await fetch(url + '/rest/v1/', { headers: h });
  const spec = await r.json();
  
  // Paths list all endpoints (tables/views/functions)
  const paths = Object.keys(spec.paths || {});
  console.log('All endpoints:', paths.join('\n'));
  
  // Definitions list all table schemas
  const defs = spec.definitions || {};
  console.log('\n\nAll definitions:', Object.keys(defs).join(', '));
  
  for (const [table, def] of Object.entries(defs)) {
    const props = Object.keys(def.properties || {});
    console.log(`\n=== ${table} (${props.length} cols) ===`);
    props.forEach(p => console.log(`  - ${p}`));
    
    // Check for any column containing "medic"
    const medic = props.filter(p => p.toLowerCase().includes('medic'));
    if (medic.length) console.log(`  *** FOUND "medic" columns: ${medic.join(', ')} ***`);
  }
})();
