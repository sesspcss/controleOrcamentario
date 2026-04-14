/**
 * run-enrich-rest.mjs
 * ─────────────────────────────────────────────────────────────────
 * Enriquecer lc131_despesas.tipo_despesa inteiramente via HTTPS REST
 * (sem conexão direta ao PostgreSQL - funciona mesmo com porta 5432 bloqueada)
 *
 * REQUER: service_role key do Supabase
 * Obtenha em: Supabase Dashboard → Settings → API → "service_role" (secret)
 *
 * USO:
 *   $env:NODE_TLS_REJECT_UNAUTHORIZED="0"
 *   node scripts/run-enrich-rest.mjs "eyJhbGciOi..." [caminho-xlsx]
 *
 * O que faz:
 *   1. Lê tipo_despesa_ref (52k rows) via GET
 *   2. Lê lc131_despesas id+descricao_processo+tipo_despesa (460k+ rows) via GET paginado
 *   3. Faz o match em Node.js (mesma lógica: específico > genérico)
 *   4. Atualiza lc131_despesas em lotes via PATCH, agrupado por tipo_despesa
 * ─────────────────────────────────────────────────────────────────
 */

const SUPABASE_URL = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODkwNDQsImV4cCI6MjA5MTM2NTA0NH0.t3tWIh3F9lmg-a6zzdmoKpupHB9i7hTfvFmPyFbZNZs';
const PAGE_SIZE      = 1000;   // rows per GET request
const PATCH_BATCH    = 400;    // IDs per PATCH request (keep URL manageable)

const SERVICE_KEY = process.argv[2];
if (!SERVICE_KEY || !SERVICE_KEY.startsWith('eyJ')) {
  console.error('Uso: node scripts/run-enrich-rest.mjs "<service_role_key>"');
  console.error('\nObtenha em: Supabase Dashboard → Settings → API → service_role (secret)');
  process.exit(1);
}

function makeHeaders(useServiceKey = false) {
  const key = useServiceKey ? SERVICE_KEY : ANON_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };
}

async function getAll(table, columns, whereClauses = '', orderBy = 'id') {
  const rows = [];
  let offset = 0;
  while (true) {
    let url = `${SUPABASE_URL}/rest/v1/${table}?select=${columns}&limit=${PAGE_SIZE}&offset=${offset}&order=${orderBy}`;
    if (whereClauses) url += `&${whereClauses}`;
    const r = await fetch(url, { headers: makeHeaders(true) });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`GET ${table} failed HTTP ${r.status}: ${text.substring(0, 300)}`);
    }
    const page = await r.json();
    if (!page.length) break;
    rows.push(...page);
    offset += page.length;
    if (page.length < PAGE_SIZE) break;
    if (offset % 50000 === 0) process.stdout.write(`\r  Lendo ${table}: ${rows.length.toLocaleString('pt-BR')} rows...`);
  }
  return rows;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  console.log('=== Enriquecimento via REST ===\n');

  // 1. Carregar tipo_despesa_ref
  console.log('Carregando tipo_despesa_ref...');
  const refRows = await getAll('tipo_despesa_ref', 'descricao_processo_norm,tipo_despesa', '', 'descricao_processo_norm');
  const refMap = new Map();
  for (const row of refRows) {
    if (row.descricao_processo_norm && row.tipo_despesa) {
      refMap.set(row.descricao_processo_norm, row.tipo_despesa);
    }
  }
  console.log(`\n✅ tipo_despesa_ref: ${refMap.size.toLocaleString('pt-BR')} mapeamentos`);

  // 2. Carregar lc131_despesas (apenas colunas necessárias)
  console.log('\nCarregando lc131_despesas (id, descricao_processo, tipo_despesa)...');
  const despesas = await getAll('lc131_despesas', 'id,descricao_processo,tipo_despesa');
  console.log(`\n✅ lc131_despesas: ${despesas.length.toLocaleString('pt-BR')} registros`);

  // 3. Match em Node.js
  console.log('\nCalculando atualizações necessárias...');
  const updatesByTipo = new Map();  // tipo_despesa -> [id, id, ...]
  let matched = 0, noMatch = 0, alreadyCorrect = 0;

  for (const row of despesas) {
    const norm = normalizeText(row.descricao_processo);
    const newTipo = refMap.get(norm);
    if (!newTipo) { noMatch++; continue; }
    if (row.tipo_despesa === newTipo) { alreadyCorrect++; continue; }
    matched++;
    let ids = updatesByTipo.get(newTipo);
    if (!ids) { ids = []; updatesByTipo.set(newTipo, ids); }
    ids.push(row.id);
  }

  console.log(`  A atualizar: ${matched.toLocaleString('pt-BR')} registros`);
  console.log(`  Já corretos: ${alreadyCorrect.toLocaleString('pt-BR')} registros`);
  console.log(`  Sem match:   ${noMatch.toLocaleString('pt-BR')} registros`);
  console.log(`  Tipos encontrados: ${updatesByTipo.size}`);
  console.log('');

  if (matched === 0) {
    console.log('✅ Nenhuma atualização necessária. Dados já estão corretos!');
    return;
  }

  // 4. PATCH em lotes por tipo_despesa
  let totalPatched = 0;
  let patchCount = 0;

  for (const [tipo, ids] of [...updatesByTipo.entries()].sort((a, b) => b[1].length - a[1].length)) {
    // Break IDs into batches
    for (let i = 0; i < ids.length; i += PATCH_BATCH) {
      const batch = ids.slice(i, i + PATCH_BATCH);
      const idList = batch.join(',');
      const url = `${SUPABASE_URL}/rest/v1/lc131_despesas?id=in.(${idList})`;
      const r = await fetch(url, {
        method: 'PATCH',
        headers: makeHeaders(true),
        body: JSON.stringify({ tipo_despesa: tipo }),
      });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(`PATCH falhou para tipo "${tipo}" HTTP ${r.status}: ${text.substring(0, 300)}`);
      }
      totalPatched += batch.length;
      patchCount++;
      process.stdout.write(`\r  PATCH #${patchCount}: ${totalPatched.toLocaleString('pt-BR')}/${matched.toLocaleString('pt-BR')} (${tipo.substring(0, 30)})   `);
    }
  }

  console.log(`\n\n✅ Enriquecimento concluído!`);
  console.log(`   Total atualizado: ${totalPatched.toLocaleString('pt-BR')} registros`);
  console.log(`   Total PATCH calls: ${patchCount}`);

  // 5. Verificação final
  console.log('\nDistribuição final dos tipos:');
  const r2 = await fetch(
    `${SUPABASE_URL}/rest/v1/lc131_despesas?select=tipo_despesa,count()&tipo_despesa=neq.null&tipo_despesa=neq.&group_by=tipo_despesa&order=count.desc&limit=60`,
    { headers: makeHeaders(true) }
  );
  // PostgREST doesn't support COUNT() directly in select - use a workaround via RPC
  const dist = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/lc131_distincts`,
    {
      method: 'POST',
      headers: makeHeaders(false),
      body: JSON.stringify({}),
    }
  );
  if (dist.ok) {
    const data = await dist.json();
    const tipos = data.distinct_tipo || [];
    console.log(`  Tipos distintos agora: ${tipos.length}`);
    tipos.slice(0, 50).forEach(t => console.log(`    • ${t}`));
  }
}

main().catch(e => {
  console.error('\n❌ Erro:', e.message);
  process.exit(1);
});
