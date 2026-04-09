import { createClient } from '@supabase/supabase-js';
const sb = createClient(
  'https://odnstbeuiojohutoqvvw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kbnN0YmV1aW9qb2h1dG9xdnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTQ1NzgsImV4cCI6MjA5MDA5MDU3OH0._71Nt-rjs3EvOuDcGcQcPFKug-iDg_dEs38UVLBLJEQ'
);

// Check a sample 2026 row to see all columns
const { data: sample } = await sb.from('lc131_despesas')
  .select('*')
  .eq('ano_referencia', 2026)
  .limit(1)
  .single();
console.log('COLUMNS in lc131_despesas:', Object.keys(sample || {}).join(', '));
console.log('\nSample enriched row:');
const { data: enriched } = await sb.from('lc131_despesas')
  .select('*')
  .eq('ano_referencia', 2026)
  .not('drs', 'is', null)
  .limit(1)
  .single();
if (enriched) {
  for (const [k, v] of Object.entries(enriched)) {
    if (v !== null && v !== '') console.log(`  ${k}: ${String(v).substring(0, 80)}`);
  }
}

// Check bd_ref sample
console.log('\nBD_REF sample:');
const { data: bdSample } = await sb.from('bd_ref').select('*').limit(3);
bdSample?.forEach((r, i) => { console.log(`\n  Row ${i+1}:`); for (const [k,v] of Object.entries(r)) { if (v) console.log(`    ${k}: ${v}`); } });

// Check how many distinct codigo_ug and codigo_projeto_atividade exist in 2026
const { data: ugSample } = await sb.from('lc131_despesas')
  .select('codigo_ug, codigo_nome_ug, nome_municipio')
  .eq('ano_referencia', 2026)
  .not('drs', 'is', null)
  .limit(3);
console.log('\nEnriched UG samples:');
ugSample?.forEach(r => console.log(`  UG: ${r.codigo_ug}, nome_ug: ${String(r.codigo_nome_ug).substring(0,60)}, mun: ${r.nome_municipio}`));

// Check unenriched sample
const { data: unenriched } = await sb.from('lc131_despesas')
  .select('codigo_ug, codigo_nome_ug, nome_municipio, codigo_projeto_atividade, codigo_nome_projeto_atividade')
  .eq('ano_referencia', 2026)
  .is('drs', null)
  .limit(3);
console.log('\nUnenriched samples:');
unenriched?.forEach(r => console.log(`  UG: ${r.codigo_ug}, PA: ${r.codigo_projeto_atividade}, mun: ${r.nome_municipio}, nome_ug: ${String(r.codigo_nome_ug).substring(0,60)}`));

// Check if we have any records from other years for 2026-related UGs
const { count: old2026 } = await sb.from('lc131_despesas')
  .select('*', { count: 'exact', head: true })
  .eq('ano_referencia', 2026)
  .not('drs', 'is', null);
const { count: new2026 } = await sb.from('lc131_despesas')
  .select('*', { count: 'exact', head: true })
  .eq('ano_referencia', 2026)
  .is('drs', null);
console.log(`\nOld enriched 2026 records: ${old2026}`);
console.log(`New unenriched 2026 records: ${new2026}`);
console.log(`Total: ${(old2026||0)+(new2026||0)}`);
console.log(`Expected: ~40354`);

// Check total records per year
const { data: perYear } = await sb.rpc('lc131_dashboard');
const anos = perYear?.por_ano;
if (anos) { console.log('\nRegistros por ano:'); anos.forEach(a => console.log(`  ${a.ano}: ${a.registros}`)); }
