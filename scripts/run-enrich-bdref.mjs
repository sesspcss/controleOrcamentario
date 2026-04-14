/**
 * run-enrich-bdref.mjs
 * ─────────────────────────────────────────────────────────────────
 * Enriquece rotulo, unidade e tipo_despesa em lc131_despesas
 * processando um código de bd_ref por vez (usa índice, sem timeout).
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

  // Passo 1: busca todos os códigos de bd_ref com dados úteis
  console.log('1. Carregando códigos de bd_ref...');
  const codigos = await callRpc('list_bdref_codigos');
  if (!Array.isArray(codigos) || codigos.length === 0) {
    console.log('  Nenhum código encontrado em bd_ref. Certifique-se de ter importado o Excel de referência.');
    return;
  }
  console.log(`   ${codigos.length} códigos encontrados.\n`);

  // Passo 2: processa um código por vez (cada call usa índice → rápido)
  console.log('2. Atualizando lc131_despesas código a código...');
  let totalUpdated = 0;
  let processed = 0;

  for (const codigo of codigos) {
    const result = await callRpc('enrich_bdref_by_code', { p_codigo: codigo });
    const count = Number(result?.updated ?? 0);
    totalUpdated += count;
    processed++;
    if (processed % 50 === 0 || count > 0) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      process.stdout.write(`\r   ${processed}/${codigos.length} códigos · ${totalUpdated} linhas atualizadas · ${elapsed}s  `);
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n\n✓ Concluído em ${elapsed}s: ${totalUpdated} registros atualizados.`);
}

main().catch(err => { console.error(err); process.exit(1); });
