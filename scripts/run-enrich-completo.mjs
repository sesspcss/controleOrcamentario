/**
 * run-enrich-completo.mjs
 * ─────────────────────────────────────────────────────────────────
 * Executa o enriquecimento completo de lc131_despesas chamando
 * refresh_dashboard_batch em loop até não restar linhas vazias.
 *
 * PRÉ-REQUISITO (uma única vez no SQL Editor do Supabase):
 *   Cole e execute: scripts/enrich-completo.sql
 *   (isso popula os passos 0-13 + atualiza a função em lote)
 *
 * USO:
 *   $env:NODE_TLS_REJECT_UNAUTHORIZED="0"; node scripts/run-enrich-completo.mjs
 * ─────────────────────────────────────────────────────────────────
 */

const SUPA_URL  = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const SUPA_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODkwNDQsImV4cCI6MjA5MTM2NTA0NH0.t3tWIh3F9lmg-a6zzdmoKpupHB9i7hTfvFmPyFbZNZs';
const BATCH     = 5000;
const MAX_ITER  = 300;

const H = {
  apikey: SUPA_KEY,
  Authorization: `Bearer ${SUPA_KEY}`,
  'Content-Type': 'application/json',
};

async function runBatch() {
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/refresh_dashboard_batch`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ p_batch_size: BATCH }),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${txt.slice(0, 400)}`);
  return parseInt(txt) || 0;
}

async function getStats() {
  const r = await fetch(
    `${SUPA_URL}/rest/v1/lc131_despesas?select=drs,rras,regiao_ad,municipio&limit=1&count=exact`,
    { headers: { ...H, Prefer: 'count=estimated' } }
  );
  // Get a small cross-section to report coverage
  const r2 = await fetch(
    `${SUPA_URL}/rest/v1/rpc/lc131_dashboard`,
    { method: 'POST', headers: H, body: JSON.stringify({ p_ano: 2026 }) }
  );
  if (r2.ok) {
    const d = await r2.json();
    return `2026: total=${d?.kpis?.total ?? '?'}, municipios=${d?.kpis?.municipios ?? '?'}`;
  }
  return '(stats unavailable)';
}

async function main() {
  console.log('══════════════════════════════════════════════════════');
  console.log('  ENRIQUECIMENTO COMPLETO — refresh_dashboard_batch');
  console.log(`  Batch: ${BATCH} | Máximo iterações: ${MAX_ITER}`);
  console.log('══════════════════════════════════════════════════════\n');

  // Smoke test
  try {
    const test = await runBatch();
    console.log(`✅ Função acessível. Primeira iteração: ${test} linhas\n`);
    if (test === 0) {
      console.log('ℹ️  Todas as linhas já estão enriquecidas!');
      console.log('   Se ainda houver colunas vazias, execute enrich-completo.sql');
      console.log('   diretamente no Supabase SQL Editor (passos 1-11 UPDATEs).\n');
    }
  } catch (e) {
    if (e.message.includes('55P03')) {
      console.error('❌ LOCK TRAVADO! Execute no SQL Editor:');
      console.error('   SELECT pg_terminate_backend(pid) FROM pg_stat_activity');
      console.error('   WHERE query ILIKE \'%lc131%\' AND state != \'idle\';');
      process.exit(1);
    }
    console.error('❌ Erro:', e.message);
    console.error('   Verifique se executou enrich-completo.sql no SQL Editor.');
    process.exit(1);
  }

  const t0 = Date.now();
  let total = 0;
  let iter  = 0;

  while (iter < MAX_ITER) {
    iter++;
    try {
      const n = await runBatch();
      total += n;
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      process.stdout.write(
        `\r  Batch ${iter.toString().padStart(3)}: +${String(n).padStart(5)} linhas` +
        `  (total: ${total.toLocaleString('pt-BR').padStart(8)},  ${secs}s)  `
      );
      if (n === 0) break;
    } catch (e) {
      console.error('\n❌ Erro no batch:', e.message);
      break;
    }
  }

  console.log('\n');
  console.log(`✅ Enriquecimento concluído: ${total.toLocaleString('pt-BR')} linhas atualizadas`);
  console.log(`   Iterações: ${iter} | Tempo: ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

  // Sample stats
  try {
    const s = await getStats();
    console.log(`📊 ${s}\n`);
  } catch (_) { /* ignore */ }

  console.log('══════════════════════════════════════════════════════');
  console.log('  PRÓXIMOS PASSOS (se ainda houver colunas vazias):');
  console.log('  1. Execute enrich-completo.sql completo no SQL Editor');
  console.log('     (cobre passos de peer-fill e trigger)');
  console.log('  2. Se tab_municipios estiver vazia:');
  console.log('     node scripts/import-tab-municipios.mjs "caminho/DRS-RRAS.xlsx"');
  console.log('══════════════════════════════════════════════════════\n');
}

main().catch(e => { console.error(e); process.exit(1); });
