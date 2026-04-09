import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://odnstbeuiojohutoqvvw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kbnN0YmV1aW9qb2h1dG9xdnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTQ1NzgsImV4cCI6MjA5MDA5MDU3OH0._71Nt-rjs3EvOuDcGcQcPFKug-iDg_dEs38UVLBLJEQ'
);

// 1. Check municipality count
const { data: munCount } = await sb.from('lc131_despesas')
  .select('municipio')
  .eq('ano_referencia', 2026)
  .not('municipio', 'is', null)
  .not('municipio', 'eq', '');
const distinctMun = new Set((munCount || []).map(r => r.municipio));
console.log(`\n1. MUNICÍPIOS (2026 não nulos): ${distinctMun.size}`);

// 2. Check how many records have NULL municipio
const { count: total2026 } = await sb.from('lc131_despesas')
  .select('*', { count: 'exact', head: true })
  .eq('ano_referencia', 2026);
const { count: nullMun } = await sb.from('lc131_despesas')
  .select('*', { count: 'exact', head: true })
  .eq('ano_referencia', 2026)
  .or('municipio.is.null,municipio.eq.');
console.log(`   Total registros 2026: ${total2026}`);
console.log(`   Registros sem município: ${nullMun}`);

// 3. Check rotulo coverage
const { count: nullRotulo } = await sb.from('lc131_despesas')
  .select('*', { count: 'exact', head: true })
  .eq('ano_referencia', 2026)
  .or('rotulo.is.null,rotulo.eq.');
console.log(`\n3. RÓTULO: ${nullRotulo} registros sem rótulo de ${total2026}`);

// 4. Check bd_ref rotulo coverage
const { data: bdRefSample } = await sb.from('bd_ref')
  .select('codigo, rotulo, tipo_despesa, fonte_recurso')
  .not('rotulo', 'is', null)
  .not('rotulo', 'eq', '')
  .limit(5);
console.log(`\n4. BD_REF com rótulo (amostra):`);
console.log(bdRefSample?.length ? bdRefSample : '   NENHUM registro com rótulo!');

// 5. Check bd_ref total & coverage
const { count: bdRefTotal } = await sb.from('bd_ref')
  .select('*', { count: 'exact', head: true });
const { count: bdRefRotulo } = await sb.from('bd_ref')
  .select('*', { count: 'exact', head: true })
  .not('rotulo', 'is', null)
  .not('rotulo', 'eq', '');
const { count: bdRefTipo } = await sb.from('bd_ref')
  .select('*', { count: 'exact', head: true })
  .not('tipo_despesa', 'is', null)
  .not('tipo_despesa', 'eq', '');
console.log(`\n5. BD_REF total: ${bdRefTotal}`);
console.log(`   Com rótulo: ${bdRefRotulo}`);
console.log(`   Com tipo_despesa: ${bdRefTipo}`);

// 6. Check enrichment status for 2026 records
const { count: enrichedDrs } = await sb.from('lc131_despesas')
  .select('*', { count: 'exact', head: true })
  .eq('ano_referencia', 2026)
  .not('drs', 'is', null)
  .not('drs', 'eq', '');
const { count: enrichedTipo } = await sb.from('lc131_despesas')
  .select('*', { count: 'exact', head: true })
  .eq('ano_referencia', 2026)
  .not('tipo_despesa', 'is', null)
  .not('tipo_despesa', 'eq', '');
console.log(`\n6. ENRIQUECIMENTO 2026:`);
console.log(`   Com DRS: ${enrichedDrs} de ${total2026}`);
console.log(`   Com tipo_despesa: ${enrichedTipo} de ${total2026}`);

// 7. Check KPI sums for 2026
const { data: kpiCheck } = await sb.rpc('lc131_dashboard', { p_ano: 2026 });
const kpis = kpiCheck?.kpis;
console.log(`\n7. KPIs retornados pelo lc131_dashboard(2026):`);
console.log(`   Empenhado:  ${Number(kpis?.empenhado || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
console.log(`   Liquidado:  ${Number(kpis?.liquidado || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
console.log(`   Pago:       ${Number(kpis?.pago || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
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
