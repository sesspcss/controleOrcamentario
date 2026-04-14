/**
 * run-enrich-rpc.mjs
 * ─────────────────────────────────────────────────────────────────
 * Chama a função server-side enrich_tipo_despesa_batch() via RPC.
 * Todo o processamento ocorre no banco — zero transferência de dados.
 *
 * PRÉ-REQUISITO: Execute create-enrich-fn.sql no Supabase SQL Editor
 *
 * USO:
 *   $env:NODE_TLS_REJECT_UNAUTHORIZED="0"
 *   node scripts/run-enrich-rpc.mjs
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

const BATCH_SIZE = 5000;  // rows per RPC call — small enough to finish in <20s

async function main() {
  console.log('Enriquecendo tipo_despesa em lotes via RPC...');
  console.log(`(${BATCH_SIZE} registros por chamada, loop em Node.js)\n`);

  const start = Date.now();
  let totalUpdated = 0;
  let iteration = 0;

  while (true) {
    iteration++;
    const result = await callRpc('enrich_tipo_despesa_batch', { p_batch_size: BATCH_SIZE });
    const count = Number(result.updated ?? result.total_updated ?? 0);
    totalUpdated += count;
    const elapsed = ((Date.now() - start) / 1000).toFixed(0);
    process.stdout.write(`\r  Lote ${iteration}: +${count} → total ${totalUpdated.toLocaleString('pt-BR')} (${elapsed}s)   `);
    if (count < BATCH_SIZE) break;
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n\n✅ Enriquecimento concluído em ${elapsed}s!`);
  console.log(`   Total atualizado: ${totalUpdated.toLocaleString('pt-BR')} registros em ${iteration} lotes`);

  // Verificar distribuição via lc131_distincts
  console.log('\nVerificando tipos distintos...');
  const distincts = await callRpc('lc131_distincts', {});
  const tipos = distincts?.distinct_tipo || [];
  console.log(`\nTipos distintos agora: ${tipos.length}`);
  tipos.forEach(t => console.log(`  • ${t}`));
}

main().catch(e => {
  console.error('\n❌ Erro:', e.message);
  process.exit(1);
});
