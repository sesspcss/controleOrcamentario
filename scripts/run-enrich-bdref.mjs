/**
 * run-enrich-bdref.mjs
 * ─────────────────────────────────────────────────────────────────
 * Enriquece as colunas rotulo, unidade e tipo_despesa (fallback)
 * em lc131_despesas a partir do bd_ref, via RPC em lotes.
 *
 * PRÉ-REQUISITO: Execute create-enrich-bdref-fn.sql no Supabase SQL Editor
 *
 * USO:
 *   $env:NODE_TLS_REJECT_UNAUTHORIZED="0"
 *   node scripts/run-enrich-bdref.mjs
 * ─────────────────────────────────────────────────────────────────
 */

const SUPABASE_URL = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTc4OTA0NCwiZXhwIjoyMDkxMzY1MDQ0fQ.YUaFE11ZfuKAaRj1UMmhvLr3bN_1yjP9D2WDBcpBee0';
const BATCH_SIZE   = 1000;

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

async function main() {
  console.log('=== Enriquecendo rotulo / unidade / tipo_despesa via bd_ref ===\n');
  const start = Date.now();
  let totalUpdated = 0;
  let iteration = 0;

  while (true) {
    iteration++;
    const result = await callRpc('enrich_bdref_batch', { p_batch_size: BATCH_SIZE });
    const count = Number(result?.updated ?? 0);
    totalUpdated += count;
    const elapsed = ((Date.now() - start) / 1000).toFixed(0);
    console.log(`  Lote ${iteration}: ${count} atualizados  (total: ${totalUpdated}, ${elapsed}s)`);
    // Para quando não há mais nada para atualizar
    if (count < BATCH_SIZE) break;
  }

  console.log(`\n✓ Enriquecimento concluído: ${totalUpdated} registros atualizados.`);

  if (totalUpdated === 0) {
    console.log('  (0 atualizações = todos os registros já tinham esses campos preenchidos)');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
