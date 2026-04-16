/**
 * fix-drs.mjs
 * Normaliza nomes de DRS processando ano a ano, em lotes de 10k IDs.
 * Igual ao run-fix-tipo.mjs: nunca trava por timeout.
 *
 * PRE-REQUISITO: Deploy de scripts/post-import-fn.sql no Supabase
 *                (cria a funcao fix_drs_range)
 *
 * USO:
 *   node scripts/fix-drs.mjs          (todos os anos)
 *   node scripts/fix-drs.mjs 2022     (so um ano)
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

async function callRpc(name, body = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`RPC ${name} HTTP ${r.status}: ${text.substring(0, 400)}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function getIdRange(ano) {
  const result = await callRpc('get_lc131_id_range', { p_ano: ano });
  return {
    minId: result?.min_id ?? null,
    maxId: result?.max_id ?? null,
    total: result?.total  ?? 0,
  };
}

async function fixAno(ano) {
  const { minId, maxId, total } = await getIdRange(ano);

  if (!total || minId === null || maxId === null) {
    console.log(`  Ano ${ano}: sem dados`);
    return 0;
  }

  const chunks = Math.ceil((maxId - minId + 1) / CHUNK_SIZE);
  console.log(`  Ano ${ano}: IDs ${minId}-${maxId} -> ${chunks} lote(s)`);

  let updated = 0;
  for (let i = 0; i < chunks; i++) {
    const idMin = minId + i * CHUNK_SIZE;
    const idMax = Math.min(idMin + CHUNK_SIZE - 1, maxId);
    process.stdout.write(`    Lote ${i + 1}/${chunks} (${idMin}-${idMax})... `);
    try {
      const n = await callRpc('fix_drs_range', { p_id_min: idMin, p_id_max: idMax });
      const count = typeof n === 'number' ? n : 0;
      updated += count;
      console.log(count > 0 ? `${count} atualizadas` : 'nenhuma (ja correto)');
    } catch (err) {
      console.log(`ERRO: ${err.message}`);
    }
  }
  return updated;
}

async function main() {
  const anoArg = process.argv[2] ? parseInt(process.argv[2], 10) : null;
  const anos = anoArg ? [anoArg] : [2022, 2023, 2024, 2025, 2026];

  console.log('\n=== FIX-DRS: Normalizando nomes de DRS ===\n');
  const t0 = Date.now();
  let total = 0;

  for (const ano of anos) {
    const n = await fixAno(ano);
    total += n;
    console.log(`  -> Ano ${ano}: ${n.toLocaleString('pt-BR')} linhas corrigidas\n`);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`=== Concluido em ${elapsed}s: ${total.toLocaleString('pt-BR')} linhas normalizadas ===\n`);
}

main().catch(err => { console.error('Erro:', err.message); process.exit(1); });
