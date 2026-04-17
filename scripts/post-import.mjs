/**
 * post-import.mjs
 * ─────────────────────────────────────────────────────────────────
 * Executado AUTOMATICAMENTE após cada import pelo import-lc131.ts.
 * Pode também ser rodado manualmente:
 *   node scripts/post-import.mjs [ano]
 *
 * O QUE FAZ (em ordem):
 *   1. refresh_bdref_lookup()    — reconstrói lookups L1-L4 (UG→tipo)
 *   2. fix_tipo_despesa_by_year  — classifica tipo_despesa para o ano
 *   3. post_import_cleanup(ano)  — normaliza DRS/RRAS, força reclassif.,
 *                                  corrige TABELA SUS, limpa bd_ref_tipo
 *
 * PRÉ-REQUISITO (deploy UMA VEZ no Supabase SQL Editor):
 *   scripts/fix-tipo-by-year.sql
 *   scripts/post-import-fn.sql
 * ─────────────────────────────────────────────────────────────────
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const SUPABASE_URL = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTc4OTA0NCwiZXhwIjoyMDkxMzY1MDQ0fQ.YUaFE11ZfuKAaRj1UMmhvLr3bN_1yjP9D2WDBcpBee0';

const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

const CHUNK_SIZE = 5_000;

// ─── Utilitários ──────────────────────────────────────────────────

async function callRpc(name, body = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`RPC ${name} HTTP ${r.status}: ${text.substring(0, 500)}`);
  try { return JSON.parse(text); } catch { return text; }
}

// ─── Passo 1: Reconstrói tabelas lookup ──────────────────────────

async function refreshLookup() {
  process.stdout.write('  [1/3] refresh_bdref_lookup()... ');
  await callRpc('refresh_bdref_lookup');
  console.log('✔');
}

// ─── Passo 2: Classifica tipo_despesa para o ano ─────────────────

async function getIdRange(ano) {
  const result = await callRpc('get_lc131_id_range', { p_ano: ano });
  return {
    minId: result?.min_id ?? null,
    maxId: result?.max_id ?? null,
    total: result?.total  ?? 0,
  };
}

async function runFixTipo(ano) {
  console.log(`  [2/3] fix_tipo_despesa_by_year (ano ${ano})...`);
  const { minId, maxId, total } = await getIdRange(ano);

  if (!total || minId === null || maxId === null) {
    console.log(`        → sem dados para ${ano}`);
    return 0;
  }

  const chunks = Math.ceil((maxId - minId + 1) / CHUNK_SIZE);
  let updated = 0;

  for (let i = 0; i < chunks; i++) {
    const idMin = minId + i * CHUNK_SIZE;
    const idMax = Math.min(idMin + CHUNK_SIZE - 1, maxId);
    process.stdout.write(`        Lote ${i + 1}/${chunks} (${idMin}–${idMax})... `);
    const res = await callRpc('fix_tipo_despesa_by_year', { p_ano: ano, p_id_min: idMin, p_id_max: idMax });
    const n = res?.updated ?? 0;
    console.log(`${n.toLocaleString('pt-BR')} linhas`);
    updated += n;
  }

  console.log(`        ✔ ${updated.toLocaleString('pt-BR')} linhas classificadas\n`);
  return updated;
}

// ─── Passo 3: Limpeza pós-import ─────────────────────────────────

async function runCleanup(ano) {
  process.stdout.write(`  [3/3] post_import_cleanup(${ano ?? 'todos'})... `);
  const result = await callRpc('post_import_cleanup', { p_ano: ano ?? null });
  console.log('✔\n');

  if (result && typeof result === 'object') {
    const fmt = (k, v) =>
      `        ${k.padEnd(30)}: ${typeof v === 'number' ? v.toLocaleString('pt-BR') : v}`;

    console.log(fmt('drs_normalized',           result.drs_normalized          ?? 0));
    console.log(fmt('drs_filled',               result.drs_filled              ?? 0));
    console.log(fmt('rras_filled',              result.rras_filled             ?? 0));
    console.log(fmt('sem_classificacao_fixed',  result.sem_classificacao_fixed ?? 0));
    console.log(fmt('tabela_sus_fonte_fixed',   result.tabela_sus_fonte_fixed  ?? 0));
    console.log(fmt('tabela_sus_reclassified',  result.tabela_sus_reclassified ?? 0));
    console.log(fmt('rotulo_filled',            result.rotulo_filled           ?? 0));
    console.log(fmt('bd_ref_tipo_truncated',    result.bd_ref_tipo_truncated   ? 'sim (+200 MB liberados)' : 'não'));

    const dbBytes = result.db_size_bytes ?? 0;
    const dbMb = (dbBytes / 1024 / 1024).toFixed(0);
    const dbStatus = dbBytes > 0
      ? (dbBytes < 500 * 1024 * 1024
          ? `${dbMb} MB ✅ (< 500 MB)`
          : `${dbMb} MB ⚠️  (> 500 MB — execute VACUUM FULL)`)
      : '(indisponível)';
    console.log(fmt('db_size_atual',            dbStatus));

    const remaining = result.sem_classificacao_remaining ?? 0;
    if (remaining > 0) {
      console.log(`\n  ⚠️  ATENÇÃO: ${remaining.toLocaleString('pt-BR')} linhas ainda sem classificação!`);
      console.log('     Verifique fix-tipo-by-year.sql e execute novamente.');
    } else {
      console.log('\n  ✅ Zero linhas sem classificação. Dados 100% completos.');
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  const anoArg = process.argv[2];
  const ano = anoArg ? parseInt(anoArg, 10) : null;

  if (anoArg && isNaN(ano)) {
    console.error(`\n❌  Argumento inválido: "${anoArg}". Use um ano (ex: 2026).\n`);
    process.exit(1);
  }

  console.log('\n════════════════════════════════════════════════════════');
  console.log('  PÓS-IMPORT LC 131 — normalização automática');
  if (ano) console.log(`  Ano: ${ano}`);
  console.log('════════════════════════════════════════════════════════\n');

  const t = Date.now();

  await refreshLookup();

  if (ano) {
    try {
      await runFixTipo(ano);
    } catch (err) {
      console.warn(`\n  ⚠️  fix_tipo_despesa_by_year falhou: ${err.message}`);
      console.warn('     Continuando para post_import_cleanup (fallback por grupo de despesa)...\n');
    }
  } else {
    console.log('  [2/3] fix_tipo_despesa_by_year — sem ano específico,');
    console.log('        use: node scripts/run-fix-tipo.mjs (para todos os anos)\n');
  }

  await runCleanup(ano);

  const elapsed = ((Date.now() - t) / 1000).toFixed(1);

  console.log(`\n✅ Pós-import concluído em ${elapsed}s`);
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  NOTAS:');
  console.log('  • bd_ref_tipo truncado — liberta ~200 MB automaticamente.');
  console.log('  • lz4 ativo — novos registros usam compressão automática.');
  console.log('  • Se ainda > 500 MB, execute no Supabase SQL Editor:');
  console.log('      VACUUM FULL ANALYZE public.lc131_despesas;');
  console.log('════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  const ano = process.argv[2] ?? '';
  console.error('\n❌ Erro no pós-import:', err.message);
  console.error('   O upload já foi salvo. Execute manualmente:');
  console.error(`   node scripts/post-import.mjs${ano ? ' ' + ano : ''}`);
  process.exit(1);
});
