/**
 * run-fix-tipo.mjs
 * ─────────────────────────────────────────────────────────────────
 * Chama fix_tipo_despesa_by_pattern() para reclassificar tipo_despesa
 * com base em padrões de descricao_processo.
 *
 * PRÉ-REQUISITO: Execute fix-tipo-despesa-pattern.sql no Supabase SQL Editor
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

async function main() {
  console.log('=== Reclassificando tipo_despesa por padrão de descricao_processo ===\n');
  const start = Date.now();

  console.log('Chamando fix_tipo_despesa_by_pattern()...');
  console.log('(pode demorar 2-5 minutos para 460k linhas)\n');

  const result = await callRpc('fix_tipo_despesa_by_pattern');
  const updated = result?.updated ?? 0;
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`✓ Concluído em ${elapsed}s: ${updated.toLocaleString('pt-BR')} registros reclassificados.`);
  if (updated === 0) {
    console.log('  → Nenhuma linha alterada: todos os tipos já estão corretos.');
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
