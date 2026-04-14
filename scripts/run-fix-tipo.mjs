/**
 * run-fix-tipo.mjs
 * ─────────────────────────────────────────────────────────────────
 * Reclassifica tipo_despesa processando um ano por vez para evitar
 * timeout do gateway HTTP (30s). Usa fix_tipo_despesa_by_year(ano).
 *
 * PRÉ-REQUISITO: Execute fix-tipo-by-year.sql no Supabase SQL Editor
 *
 * USO:
 *   $env:NODE_TLS_REJECT_UNAUTHORIZED="0"
 *   node scripts/run-fix-tipo.mjs
 * ─────────────────────────────────────────────────────────────────
 */

const SUPABASE_URL = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTc4OTA0NCwiZXhwIjoyMDkxMzY1MDQ0fQ.YUaFE11ZfuKAaRj1UMmhvLr3bN_1yjP9D2WDBcpBee0';

const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function callRpc(name, body = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`RPC ${name} HTTP ${r.status}: ${text.substring(0, 500)}`);
  return JSON.parse(text);
}

// Anos a processar — ajuste se necessário
const ANOS = [2023, 2024, 2025, 2026];

async function main() {
  console.log('=== Reclassificando tipo_despesa (um ano por vez) ===\n');
  const globalStart = Date.now();
  let totalUpdated = 0;

  for (const ano of ANOS) {
    const t = Date.now();
    process.stdout.write(`  Ano ${ano}... `);
    let result;
    try {
      result = await callRpc('fix_tipo_despesa_by_year', { p_ano: ano });
    } catch (err) {
      console.log(`ERRO: ${err.message}`);
      continue;
    }
    const n = result?.updated ?? 0;
    const s = ((Date.now() - t) / 1000).toFixed(1);
    console.log(`${n.toLocaleString('pt-BR')} linhas atualizadas (${s}s)`);
    totalUpdated += n;
  }

  const elapsed = ((Date.now() - globalStart) / 1000).toFixed(1);
  console.log(`\n✓ Concluído em ${elapsed}s: ${totalUpdated.toLocaleString('pt-BR')} registros reclassificados.`);
  if (totalUpdated === 0) {
    console.log('  → Nenhuma linha alterada: todos os tipos já estão corretos.');
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
