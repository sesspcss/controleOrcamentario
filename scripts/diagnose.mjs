import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://odnstbeuiojohutoqvvw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kbnN0YmV1aW9qb2h1dG9xdnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTQ1NzgsImV4cCI6MjA5MDA5MDU3OH0._71Nt-rjs3EvOuDcGcQcPFKug-iDg_dEs38UVLBLJEQ'
);

console.log("=== DIAGNÓSTICO COMPLETO ===\n");

// 1. tab_drs
const { count: drsCount } = await sb.from('tab_drs').select('*', { count: 'exact', head: true });
const { data: drsSample } = await sb.from('tab_drs').select('*').limit(5);
console.log(`1. tab_drs: ${drsCount} rows`);
console.log(`   Sample:`, JSON.stringify(drsSample));

// 2. tab_rras
const { count: rrasCount } = await sb.from('tab_rras').select('*', { count: 'exact', head: true });
console.log(`\n2. tab_rras: ${rrasCount} rows`);

// 3. bd_ref
const { count: bdRefTotal } = await sb.from('bd_ref').select('*', { count: 'exact', head: true });
const { data: bdSample } = await sb.from('bd_ref').select('codigo,drs,unidade,municipio,rotulo').limit(5);
console.log(`\n3. bd_ref: ${bdRefTotal} rows`);
console.log(`   Sample:`, JSON.stringify(bdSample));

// 4. lc131_despesas per-column counts
const { count: total } = await sb.from('lc131_despesas').select('*', { count: 'exact', head: true });
const cols = ['drs','rras','unidade','rotulo','municipio','nome_municipio','regiao_ad','regiao_sa','cod_ibge'];
console.log(`\n4. lc131_despesas: ${total} total`);
for (const col of cols) {
  const { count: filled } = await sb.from('lc131_despesas')
    .select('*', { count: 'exact', head: true })
    .not(col, 'is', null)
    .neq(col, '');
  console.log(`   ${col.padEnd(20)} preenchido: ${filled}  (vazio: ${total - filled})`);
}

// 5. Sample: rows with municipio but no DRS
const { data: noDrs } = await sb.from('lc131_despesas')
  .select('id,nome_municipio,municipio,drs,rras,unidade,rotulo,codigo_ug,codigo_projeto_atividade')
  .not('municipio', 'is', null)
  .is('drs', null)
  .limit(5);
console.log(`\n5. Rows com municipio mas SEM drs:`, JSON.stringify(noDrs, null, 2));

// 6. Test refresh_dashboard_batch(1)
const { data: batchTest, error: batchErr } = await sb.rpc('refresh_dashboard_batch', { p_batch_size: 1 });
console.log(`\n6. refresh_dashboard_batch(1) = ${batchTest ?? 'ERRO: ' + batchErr?.message}`);

// 7. Per-year breakdown
for (const ano of [2022, 2023, 2024, 2025, 2026]) {
  const { count: t } = await sb.from('lc131_despesas').select('*', { count: 'exact', head: true }).eq('ano_referencia', ano);
  const { count: d } = await sb.from('lc131_despesas').select('*', { count: 'exact', head: true }).eq('ano_referencia', ano).not('drs', 'is', null).neq('drs', '');
  const { count: u } = await sb.from('lc131_despesas').select('*', { count: 'exact', head: true }).eq('ano_referencia', ano).not('unidade', 'is', null).neq('unidade', '');
  console.log(`\n   ${ano}: ${t} total | DRS: ${d} | Unidade: ${u}`);
}
console.log(`   Pago Total: ${Number(kpis?.pago_total || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
console.log(`   Registros:  ${kpis?.total}`);
console.log(`   Municípios: ${kpis?.municipios}`);

// 8. Expected values
console.log(`\n8. VALORES ESPERADOS (planilha):`);
console.log(`   Empenhado:  19.713.894.203,10`);
console.log(`   Liquidado:  9.051.086.795,07`);
console.log(`   Pago:       8.496.942.368,33`);
console.log(`   PagoAntAnt: 2.643.153.229,18`);
console.log(`   Total:      11.140.095.597,51`);

// 9. Check distinct codigo_nome_fonte_recurso for 2026
const { data: fonteSample } = await sb.from('lc131_despesas')
  .select('codigo_nome_fonte_recurso')
  .eq('ano_referencia', 2026)
  .not('codigo_nome_fonte_recurso', 'is', null)
  .limit(1000);
const distinctFonte = [...new Set((fonteSample || []).map(r => r.codigo_nome_fonte_recurso).filter(Boolean))];
console.log(`\n9. FONTES RECURSO (raw distinctas 2026, amostra): ${distinctFonte.length}`);
distinctFonte.sort().forEach(f => console.log(`   ${f}`));
