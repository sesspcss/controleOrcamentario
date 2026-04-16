/**
 * fix-drs.mjs
 * ─────────────────────────────────────────────────────────────────
 * Normaliza os nomes de DRS na tabela lc131_despesas:
 *   "01 Grande São Paulo"  →  "DRS I - Grande São Paulo"
 *
 * Usa a função SQL fix_drs_range(id_min, id_max) em lotes de
 * CHUNK_SIZE IDs para evitar timeout do Supabase.
 *
 * PRÉ-REQUISITO: Deploy de scripts/post-import-fn.sql no Supabase
 *
 * USO:
 *   node scripts/fix-drs.mjs
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

const CHUNK_SIZE = 10_000;

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

async function getIdRange() {
  const result = await callRpc('get_lc131_id_range', { p_ano: null });
  // get_lc131_id_range sem ano retorna o range global
  // Se não suportar null, busca direto via REST
  if (result?.min_id != null) return { minId: result.min_id, maxId: result.max_id };

  // Fallback: busca min/max via REST
  const [rMin, rMax] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/lc131_despesas?select=id&order=id.asc&limit=1`, { headers: HEADERS }),
    fetch(`${SUPABASE_URL}/rest/v1/lc131_despesas?select=id&order=id.desc&limit=1`, { headers: HEADERS }),
  ]);
  const [dMin, dMax] = await Promise.all([rMin.json(), rMax.json()]);
  return { minId: dMin[0]?.id, maxId: dMax[0]?.id };
}

async function main() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  FIX-DRS — Normalização de nomes de DRS (por faixa de ID)');
  console.log('════════════════════════════════════════════════════════\n');

  const { minId, maxId } = await getIdRange();
  if (!minId || !maxId) throw new Error('Não foi possível obter o range de IDs da tabela.');

  const chunks = Math.ceil((maxId - minId + 1) / CHUNK_SIZE);
  console.log(`  IDs ${minId}–${maxId} → ${chunks} lotes de ${CHUNK_SIZE.toLocaleString('pt-BR')}\n`);

  let total = 0;

  for (let i = 0; i < chunks; i++) {
    const idMin = minId + i * CHUNK_SIZE;
    const idMax = Math.min(idMin + CHUNK_SIZE - 1, maxId);
    const pct = Math.round(((i + 1) / chunks) * 100);
    process.stdout.write(`  Lote ${String(i + 1).padStart(4)}/${chunks}  (${idMin}–${idMax})  ${pct}%... `);
    try {
      const n = await callRpc('fix_drs_range', { p_id_min: idMin, p_id_max: idMax });
      const updated = typeof n === 'number' ? n : 0;
      total += updated;
      console.log(updated > 0 ? `${updated} atualizadas` : '–');
    } catch (err) {
      console.log(`ERRO: ${err.message}`);
    }
  }

  console.log(`\n✅ Concluído: ${total.toLocaleString('pt-BR')} linhas normalizadas.`);
  console.log('════════════════════════════════════════════════════════\n');
}

main().catch(err => { console.error('\n❌', err.message); process.exit(1); });

 * ─────────────────────────────────────────────────────────────────
 * Normaliza os nomes de DRS na tabela lc131_despesas:
 *   "01 GRANDE SÃO PAULO"  →  "DRS I - GRANDE SÃO PAULO"
 *
 * Faz um UPDATE por valor (17 queries, ~25k linhas cada),
 * evitando timeout do Supabase.
 *
 * USO:
 *   node scripts/fix-drs.mjs
 * ─────────────────────────────────────────────────────────────────
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const SUPABASE_URL = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTc4OTA0NCwiZXhwIjoyMDkxMzY1MDQ0fQ.YUaFE11ZfuKAaRj1UMmhvLr3bN_1yjP9D2WDBcpBee0';

const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

// Mapa completo: valor antigo (prefixo numérico, Title Case) → valor canônico (DRS romano, Title Case)
// Formato confirmado via query ao banco: "01 Grande São Paulo" e "DRS I - Grande São Paulo"
const DRS_MAP = [
  ['01 Grande São Paulo',       'DRS I - Grande São Paulo'],
  ['02 Araçatuba',              'DRS II - Araçatuba'],
  ['03 Araraquara',             'DRS III - Araraquara'],
  ['04 Baixada Santista',       'DRS IV - Baixada Santista'],
  ['05 Barretos',               'DRS V - Barretos'],
  ['06 Bauru',                  'DRS VI - Bauru'],
  ['07 Campinas',               'DRS VII - Campinas'],
  ['08 Franca',                 'DRS VIII - Franca'],
  ['09 Marília',                'DRS IX - Marília'],
  ['10 Piracicaba',             'DRS X - Piracicaba'],
  ['11 Presidente Prudente',    'DRS XI - Presidente Prudente'],
  ['12 Registro',               'DRS XII - Registro'],
  ['13 Ribeirão Preto',         'DRS XIII - Ribeirão Preto'],
  ['14 São João Da Boa Vista',  'DRS XIV - São João Da Boa Vista'],
  ['15 São José Do Rio Preto',  'DRS XV - São José Do Rio Preto'],
  ['16 Sorocaba',               'DRS XVI - Sorocaba'],
  ['17 Taubaté',                'DRS XVII - Taubaté'],
];

async function updateDrs(oldVal, newVal) {
  const url = `${SUPABASE_URL}/rest/v1/lc131_despesas?drs=eq.${encodeURIComponent(oldVal)}`;
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { ...HEADERS, Prefer: 'count=exact' },
    body: JSON.stringify({ drs: newVal }),
  });
  const countHeader = r.headers.get('content-range');
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`HTTP ${r.status}: ${text.substring(0, 300)}`);
  }
  // content-range: */N  (rows affected)
  const affected = countHeader ? countHeader.replace('*/', '') : '?';
  return affected;
}

async function diagnose() {
  const url = `${SUPABASE_URL}/rest/v1/lc131_despesas?select=drs&drs=like.0*,drs=like.1*&limit=0`;
  // Verifica se ainda há valores no formato antigo
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/lc131_despesas?select=drs&drs=ilike.%25${encodeURIComponent('0')}%25&limit=0`,
    { headers: HEADERS }
  );

  // Consulta simples: conta linhas que começam com dígito
  const r2 = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/`, { method: 'GET', headers: HEADERS }
  ).catch(() => null);

  return null; // diagnose via update results
}

async function main() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  FIX-DRS — Normalização de nomes de DRS');
  console.log('════════════════════════════════════════════════════════\n');

  let totalAffected = 0;

  for (const [oldVal, newVal] of DRS_MAP) {
    process.stdout.write(`  "${oldVal}" → "${newVal}"... `);
    try {
      const affected = await updateDrs(oldVal, newVal);
      console.log(`${affected} linhas`);
      const n = parseInt(affected, 10);
      if (!isNaN(n)) totalAffected += n;
    } catch (err) {
      console.log(`ERRO: ${err.message}`);
    }
  }

  console.log(`\n✅ Concluído: ${totalAffected.toLocaleString('pt-BR')} linhas atualizadas.`);

  if (totalAffected === 0) {
    console.log('   → Nenhuma linha alterada. Todos os DRS já estão no formato canônico,');
    console.log('     ou os valores no banco têm formato diferente do esperado.');
    console.log('\n   Para diagnóstico, execute no Supabase SQL Editor:');
    console.log("   SELECT DISTINCT drs FROM public.lc131_despesas ORDER BY drs;");
  }

  console.log('════════════════════════════════════════════════════════\n');
}

main().catch(err => { console.error('\n❌', err.message); process.exit(1); });
