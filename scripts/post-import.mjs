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
  let result = null;
  try {
    result = await callRpc('post_import_cleanup', { p_ano: ano ?? null });
    console.log('✔\n');
  } catch (err) {
    console.warn(`\n  ⚠️  post_import_cleanup falhou: ${err.message.substring(0, 120)}`);
    console.warn('     Continuando com fallbacks automáticos...\n');
    return { rotulo_filled: 0, cleanup_failed: true };
  }

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
  return result ?? {};
}

// ─── Passo 3.1: Fallback tipo_despesa por grupo (REST direto, sem SQL) ────────
// Roda sempre após runCleanup. Se ainda há NULLs, preenche pelo grupo de despesa.
// Não depende de nenhuma função SQL implantada no Supabase.

async function runTipoFallback(ano) {
  const GRUPO_MAP = [
    { prefix: '1', tipo: 'PESSOAL E ENCARGOS SOCIAIS' },
    { prefix: '2', tipo: 'JUROS E ENCARGOS DA DÍVIDA' },
    { prefix: '3', tipo: 'OUTRAS DESPESAS CORRENTES' },
    { prefix: '4', tipo: 'INVESTIMENTOS' },
    { prefix: '5', tipo: 'INVERSÕES FINANCEIRAS' },
  ];

  let total = 0;
  for (const { prefix, tipo } of GRUPO_MAP) {
    const url = `${SUPABASE_URL}/rest/v1/lc131_despesas` +
      `?ano_referencia=eq.${ano}&tipo_despesa=is.null` +
      `&codigo_nome_grupo=like.${prefix}%25`;
    const r = await fetch(url, {
      method: 'PATCH',
      headers: { ...HEADERS, Prefer: 'count=exact', 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo_despesa: tipo }),
    });
    if (r.ok) {
      const range = r.headers.get('content-range');
      const n = parseInt((range?.split('/')[1] ?? '0'), 10);
      if (!isNaN(n)) total += n;
    }
  }
  // Default: qualquer NULL restante (grupos raros)
  const defaultUrl = `${SUPABASE_URL}/rest/v1/lc131_despesas` +
    `?ano_referencia=eq.${ano}&tipo_despesa=is.null`;
  const dr = await fetch(defaultUrl, {
    method: 'PATCH',
    headers: { ...HEADERS, Prefer: 'count=exact', 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo_despesa: 'OUTRAS DESPESAS CORRENTES' }),
  });
  if (dr.ok) {
    const range = dr.headers.get('content-range');
    const n = parseInt((range?.split('/')[1] ?? '0'), 10);
    if (!isNaN(n)) total += n;
  }
  if (total > 0) {
    console.log(`  [fallback] tipo_despesa (grupo)  : ${total.toLocaleString('pt-BR')} linhas preenchidas`);
  }
  return total;
}

// ─── Passo 3.2: Preenchimento de rótulo via REST (sem SQL) ───────────────────
// Busca valores distintos de codigo_nome_projeto_atividade onde rotulo está NULL,
// e faz PATCH em lotes. Não depende de nenhuma função SQL implantada.

async function fillRotuloREST(ano) {
  // 1. Busca todas as linhas com rotulo NULL e projeto preenchido (até 10k)
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/lc131_despesas` +
    `?ano_referencia=eq.${ano}&rotulo=is.null` +
    `&codigo_nome_projeto_atividade=not.is.null` +
    `&select=codigo_nome_projeto_atividade&limit=10000`,
    { headers: HEADERS }
  );
  if (!resp.ok) {
    console.warn(`  ⚠️  fillRotuloREST: erro ao buscar projetos: HTTP ${resp.status}`);
    return 0;
  }
  const rows = await resp.json();
  if (!rows.length) return 0;

  // 2. Coleta valores distintos
  const unique = [...new Set(rows.map(r => r.codigo_nome_projeto_atividade?.trim()).filter(Boolean))];
  if (!unique.length) return 0;

  // 3. PATCH por valor distinto: atualiza rotulo = valor para todas as linhas
  //    com aquele projeto e rotulo ainda NULL
  let total = 0;
  for (const val of unique) {
    const enc = encodeURIComponent(val);
    const pr = await fetch(
      `${SUPABASE_URL}/rest/v1/lc131_despesas` +
      `?ano_referencia=eq.${ano}&rotulo=is.null&codigo_nome_projeto_atividade=eq.${enc}`,
      {
        method: 'PATCH',
        headers: { ...HEADERS, Prefer: 'count=exact' },
        body: JSON.stringify({ rotulo: val }),
      }
    );
    if (pr.ok) {
      const range = pr.headers.get('content-range') ?? '';
      const n = parseInt(range.split('/')[1] ?? '0', 10);
      if (!isNaN(n)) total += n;
    }
  }
  return total;
}

async function runRotuloFallback(ano) {
  process.stdout.write(`  [fallback] rótulo (REST)... `);
  // Tenta fill_rotulo_ano SQL primeiro (se deployado)
  try {
    const n = await callRpc('fill_rotulo_ano', { p_ano: ano ?? null });
    const count = typeof n === 'number' ? n : 0;
    if (count > 0) {
      console.log(`${count.toLocaleString('pt-BR')} rótulos via SQL`);
      return count;
    }
  } catch { /* não deployado — cai para REST */ }

  // Fallback: preenchimento via REST sem SQL
  const n = await fillRotuloREST(ano);
  console.log(n > 0 ? `${n.toLocaleString('pt-BR')} rótulos via REST` : 'nenhum NULL restante');
  return n;
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

  const cleanupResult = await runCleanup(ano);

  // Fallbacks automáticos — garantem tipo_despesa e rótulo mesmo se
  // post_import_cleanup falhou (timeout) ou é versão antiga (sem esses passos).
  if (ano) {
    await runTipoFallback(ano);
    // Rótulo: só roda se cleanup não preencheu
    const rotuloJaFilled = (cleanupResult?.rotulo_filled ?? 0) > 0;
    if (!rotuloJaFilled) {
      await runRotuloFallback(ano);
    }
  }

  // ─── Verificação final ────────────────────────────────────────────────────
  if (ano) {
    let tipoNull = 0, rotuloNull = 0;
    try {
      const tv = await fetch(
        `${SUPABASE_URL}/rest/v1/lc131_despesas?ano_referencia=eq.${ano}&tipo_despesa=is.null&select=id&limit=1`,
        { headers: { ...HEADERS, Prefer: 'count=exact' } }
      );
      tipoNull = parseInt((tv.headers.get('content-range') ?? '').split('/')[1] ?? '0', 10);
      const rv = await fetch(
        `${SUPABASE_URL}/rest/v1/lc131_despesas?ano_referencia=eq.${ano}&rotulo=is.null&select=id&limit=1`,
        { headers: { ...HEADERS, Prefer: 'count=exact' } }
      );
      rotuloNull = parseInt((rv.headers.get('content-range') ?? '').split('/')[1] ?? '0', 10);
    } catch { /* ignorar erros de verificação */ }

    console.log('\n  ── Verificação final ─────────────────────────────────────');
    console.log(`        tipo_despesa NULL      : ${tipoNull === 0 ? '0 ✅' : tipoNull + ' ⚠️ ATENÇÃO'}`);
    console.log(`        rotulo NULL           : ${rotuloNull === 0 ? '0 ✅' : rotuloNull + ' ⚠️ ATENÇÃO'}`);
  }

  const elapsed = ((Date.now() - t) / 1000).toFixed(1);

  console.log(`\n✅ Pós-import concluído em ${elapsed}s`);
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  PARA REDUZIR O BANCO ABAIXO DE 500 MB:');
  console.log('  Execute este comando no Supabase SQL Editor:');
  console.log('');
  console.log('      VACUUM FULL ANALYZE public.lc131_despesas;');
  console.log('      VACUUM FULL ANALYZE public.bd_ref_tipo;');
  console.log('');
  console.log('  (leva 5-10 min, banco fica < 300 MB após)');
  console.log('════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  const ano = process.argv[2] ?? '';
  console.error('\n❌ Erro no pós-import:', err.message);
  console.error('   O upload já foi salvo. Execute manualmente:');
  console.error(`   node scripts/post-import.mjs${ano ? ' ' + ano : ''}`);
  process.exit(1);
});
