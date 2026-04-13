/**
 * Diagnóstico REST: verifica tamanhos de tabelas e objetos via RPC.
 * Não requer SQL Editor nem conexão pg direta.
 *
 * Uso: $env:NODE_TLS_REJECT_UNAUTHORIZED="0"; node scripts/check-db-size.mjs
 */
const SUPA_URL = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODkwNDQsImV4cCI6MjA5MTM2NTA0NH0.t3tWIh3F9lmg-a6zzdmoKpupHB9i7hTfvFmPyFbZNZs';

const H = {
  apikey: SUPA_KEY,
  Authorization: 'Bearer ' + SUPA_KEY,
  'Content-Type': 'application/json',
};

async function rpc(fn, body = {}) {
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: H, body: JSON.stringify(body),
  });
  const txt = await r.text();
  try { return { ok: r.ok, status: r.status, data: JSON.parse(txt) }; }
  catch { return { ok: r.ok, status: r.status, data: txt }; }
}

async function restCount(table) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}?select=id`, {
    method: 'HEAD',
    headers: { ...H, Prefer: 'count=exact' },
  });
  return r.headers.get('content-range') ?? '?';
}

(async () => {
  console.log('========================================');
  console.log(' DIAGNÓSTICO DO BANCO DE DADOS');
  console.log('========================================\n');

  // 1. Contagem de linhas por tabela (via REST HEAD)
  const tables = ['lc131_despesas', 'bd_ref', 'tab_municipios', 'tab_drs', 'tab_rras'];
  console.log('--- CONTAGEM DE LINHAS ---');
  for (const t of tables) {
    try {
      const cr = await restCount(t);
      console.log(`  ${t.padEnd(25)}: ${cr}`);
    } catch (e) {
      console.log(`  ${t.padEnd(25)}: ERRO - ${e.message}`);
    }
  }

  // 2. Verificar se lc131_enriquecida ainda existe
  console.log('\n--- VIEWS / MATERIALIZED VIEWS ---');
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/lc131_enriquecida?select=id&limit=1`, {
      headers: H,
    });
    if (r.ok) {
      const cr = r.headers.get('content-range');
      console.log(`  lc131_enriquecida: EXISTE (${cr ?? '?'})`);
    } else {
      const t = await r.text();
      if (t.includes('does not exist') || r.status === 404) {
        console.log('  lc131_enriquecida: NÃO EXISTE (já removida) ✓');
      } else {
        console.log(`  lc131_enriquecida: status ${r.status} - ${t.slice(0, 100)}`);
      }
    }
  } catch (e) {
    console.log(`  lc131_enriquecida: ERRO - ${e.message}`);
  }

  // 3. Verificar lc131_mv (materialized view antiga)
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/lc131_mv?select=id&limit=1`, {
      headers: H,
    });
    if (r.ok) {
      console.log('  lc131_mv: EXISTE (materialized view - grande consumo!)');
    } else {
      console.log('  lc131_mv: NÃO EXISTE ✓');
    }
  } catch {
    console.log('  lc131_mv: NÃO EXISTE ✓');
  }

  // 4. Anos disponíveis
  console.log('\n--- DADOS por ANO ---');
  try {
    const r = await fetch(
      `${SUPA_URL}/rest/v1/lc131_despesas?select=ano_referencia&limit=1`,
      { headers: H }
    );
    if (!r.ok) { console.log('  Sem acesso REST direto à lc131_despesas'); }
  } catch {}

  // Usa RPC lc131_dashboard para ver por ano
  for (const ano of [2022, 2023, 2024, 2025, 2026]) {
    const res = await rpc('lc131_dashboard', { p_ano: ano });
    if (res.ok && res.data?.kpis) {
      const k = res.data.kpis;
      console.log(`  ${ano}: ${String(k.total).padStart(8)} registros | Emp: R$${(k.empenhado/1e9).toFixed(2)}B | Munic: ${k.municipios}`);
    } else {
      console.log(`  ${ano}: sem dados ou erro (${JSON.stringify(res.data).slice(0,80)})`);
    }
  }

  // 5. Verificar RPC de tamanho (se existe)
  console.log('\n--- FUNÇÕES RPC DISPONÍVEIS ---');
  const rpcs = ['lc131_dashboard', 'lc131_distincts', 'lc131_delete_year', 'refresh_dashboard_batch'];
  for (const fn of rpcs) {
    const res = await rpc(fn, {});
    const exists = res.status !== 404 && !String(res.data).includes('does not exist');
    console.log(`  ${fn.padEnd(30)}: ${exists ? 'EXISTE ✓' : 'NÃO EXISTE ✗'}`);
  }

  // 6. Verificar RRAS ainda com formato numérico puro
  console.log('\n--- QUALIDADE DOS DADOS ---');
  try {
    const res = await rpc('lc131_dashboard', {});
    if (res.ok && res.data?.por_rras) {
      const badRras = (res.data.por_rras ?? []).filter(r => /^\d+$/.test(r.rras));
      console.log(`  RRAS em formato numérico puro: ${badRras.length === 0 ? '0 (OK ✓)' : badRras.length + ' PROBLEMA!'}`);
      if (badRras.length > 0) {
        badRras.slice(0, 5).forEach(r => console.log(`    → "${r.rras}"`));
      }
    }
  } catch {}

  console.log('\n========================================');
  console.log(' RECOMENDAÇÕES (ver output acima)');
  console.log('========================================');
  console.log(`
  1. tab_drs + tab_rras existindo       → REMOVER via SQL Editor (economiza ~2-5 MB)
  2. lc131_enriquecida existindo        → REMOVER via SQL Editor (economiza ~5-50 MB)
  3. lc131_mv existindo                 → REMOVER URGENTE (economiza ~200-300 MB)
  4. VACUUM FULL lc131_despesas         → EXECUTAR após remoções (economiza 20-40%)
  5. Criar função cleanup_obsolete_rpc  → ver scripts/final-cleanup.sql
  `);
})();
