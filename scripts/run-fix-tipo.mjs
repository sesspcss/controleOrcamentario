/**
 * run-fix-tipo.mjs
 * ─────────────────────────────────────────────────────────────────
 * Reclassifica tipo_despesa em lotes de IDs para evitar o timeout
 * de 30s do gateway HTTP do Supabase.
 *
 * Estratégia: por ano, descobre o min/max ID via REST e chama
 * fix_tipo_despesa_by_year(ano, id_min, id_max) em chunks de CHUNK_SIZE.
 *
 * PRÉ-REQUISITO: Execute fix-tipo-by-year.sql no Supabase SQL Editor
 *
 * USO:
 *   $env:NODE_TLS_REJECT_UNAUTHORIZED="0"
 *   node scripts/run-fix-tipo.mjs
 * ─────────────────────────────────────────────────────────────────
 */

const SUPABASE_URL = 'https://teikzwrfsxjipxozzhbr.supabase.co';
// Necessário no ambiente Windows para ignorar cert auto-assinado do proxy
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTc4OTA0NCwiZXhwIjoyMDkxMzY1MDQ0fQ.YUaFE11ZfuKAaRj1UMmhvLr3bN_1yjP9D2WDBcpBee0';

const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

// Linhas por chamada RPC — 10k mantém o UPDATE dentro de ~25s no free plan
const CHUNK_SIZE = 10_000;

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

async function getIdRange(ano) {
  // Usa RPC dedicado — mais confiável que queries REST com ORDER BY
  const result = await callRpc('get_lc131_id_range', { p_ano: ano });
  return {
    minId: result?.min_id   ?? null,
    maxId: result?.max_id   ?? null,
    total: result?.total    ?? 0,
  };
}

// Anos a processar — inclui 2022 para reclassificação completa
const ANOS = [2022, 2023, 2024, 2025, 2026];

async function main() {
  console.log('=== Reclassificando tipo_despesa (lotes por ID) ===\n');
  const globalStart = Date.now();
  let totalUpdated = 0;

  for (const ano of ANOS) {
    const tAno = Date.now();
    process.stdout.write(`  Ano ${ano}  obtendo range de IDs... `);

    let minId, maxId, total;
    try {
      ({ minId, maxId, total } = await getIdRange(ano));
    } catch (err) {
      console.log(`ERRO ao obter range: ${err.message}`);
      continue;
    }

    if (!total || minId === null || maxId === null) {
      console.log(`sem dados (total=${total})`);
      continue;
    }

    const chunks = Math.ceil((maxId - minId + 1) / CHUNK_SIZE);
    console.log(`IDs ${minId}–${maxId} → ${chunks} lote(s)`);

    let anoUpdated = 0;
    for (let chunk = 0; chunk < chunks; chunk++) {
      const idMin = minId + chunk * CHUNK_SIZE;
      const idMax = Math.min(idMin + CHUNK_SIZE - 1, maxId);
      const tChunk = Date.now();
      process.stdout.write(`    Lote ${chunk + 1}/${chunks} (${idMin}–${idMax})... `);
      let result;
      try {
        result = await callRpc('fix_tipo_despesa_by_year', { p_ano: ano, p_id_min: idMin, p_id_max: idMax });
      } catch (err) {
        console.log(`ERRO: ${err.message}`);
        continue;
      }
      const n = result?.updated ?? 0;
      const s = ((Date.now() - tChunk) / 1000).toFixed(1);
      console.log(`${n.toLocaleString('pt-BR')} atualizadas (${s}s)`);
      anoUpdated += n;
    }

    const sAno = ((Date.now() - tAno) / 1000).toFixed(1);
    console.log(`  ✓ Ano ${ano}: ${anoUpdated.toLocaleString('pt-BR')} linhas em ${sAno}s\n`);
    totalUpdated += anoUpdated;
  }

  const elapsed = ((Date.now() - globalStart) / 1000).toFixed(1);
  console.log(`✓ Concluído em ${elapsed}s: ${totalUpdated.toLocaleString('pt-BR')} registros reclassificados.`);
  if (totalUpdated === 0) {
    console.log('  → Nenhuma linha alterada: todos os tipos já estão corretos.');
  }
}


main().catch(err => { console.error(err.message); process.exit(1); });
