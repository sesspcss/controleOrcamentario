/**
 * run-rebuild.mjs
 * ─────────────────────────────────────────────────────────────────
 * Reconstrói a tabela lc131_despesas via RPC para eliminar dead tuples
 * e recuperar espaço em disco (equivalente ao VACUUM FULL).
 *
 * PRÉ-REQUISITO: Execute create-rebuild-fns.sql no Supabase SQL Editor
 *
 * USO:
 *   $env:NODE_TLS_REJECT_UNAUTHORIZED="0"
 *   node scripts/run-rebuild.mjs
 * ─────────────────────────────────────────────────────────────────
 */

const SUPABASE_URL = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTc4OTA0NCwiZXhwIjoyMDkxMzY1MDQ0fQ.YUaFE11ZfuKAaRj1UMmhvLr3bN_1yjP9D2WDBcpBee0';
const BATCH_SIZE   = 10000;

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
  if (!r.ok) throw new Error(`RPC ${name} → HTTP ${r.status}: ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function main() {
  console.log('=== Rebuild lc131_despesas (elimina dead tuples) ===\n');

  // ── PASSO 1: Conta total de linhas e cria tabela staging ─────────
  console.log('1. Inicializando staging table...');
  const initResult = await callRpc('rebuild_lc131_init');
  console.log('   ', initResult);

  // Descobrir quantas linhas existem para calcular batches
  const countResp = await fetch(
    `${SUPABASE_URL}/rest/v1/lc131_despesas?select=id&limit=1`,
    { method: 'HEAD', headers: { ...HEADERS, Prefer: 'count=exact' } }
  );
  const totalRows = parseInt(countResp.headers.get('content-range')?.split('/')[1] ?? '0', 10);
  console.log(`   Total de linhas: ${totalRows.toLocaleString()}\n`);

  // ── PASSO 2: Copia em lotes para staging ─────────────────────────
  console.log(`2. Copiando para staging em lotes de ${BATCH_SIZE.toLocaleString()}...`);
  let offset = 0;
  let totalCopied = 0;
  while (offset < totalRows) {
    const result = await callRpc('rebuild_lc131_batch', {
      p_offset: offset,
      p_limit: BATCH_SIZE,
    });
    const copied = Number(result?.copied ?? 0);
    totalCopied += copied;
    process.stdout.write(`\r   Copiadas: ${totalCopied.toLocaleString()} / ${totalRows.toLocaleString()}  `);
    if (copied < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }
  console.log(`\n   Cópia concluída: ${totalCopied.toLocaleString()} linhas.\n`);

  if (totalCopied === 0) {
    console.error('ERRO: Nenhuma linha copiada para staging. Abortando.');
    process.exit(1);
  }

  // ── PASSO 3: TRUNCATE + re-insert + drop staging ─────────────────
  console.log('3. Reconstruindo tabela (TRUNCATE + re-insert server-side)...');
  console.log('   Aguarde ~5-15 segundos...');
  const finishResult = await callRpc('rebuild_lc131_finish');
  console.log('   ', finishResult);

  console.log('\n✓ Rebuild concluído! Dead tuples eliminados, espaço recuperado.');
  console.log('  Execute agora o Statement B de cleanup-and-vacuum-part2.sql (índices).');
}

main().catch(err => { console.error(err); process.exit(1); });
