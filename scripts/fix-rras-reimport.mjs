/**
 * fix-rras-reimport.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Corrige RRAS numérico ('6','9') SEM precisar de acesso ao pg ou SQL Editor:
 *   1. Carrega tab_municipios em memória (lookup de referência)
 *   2. Lê TODOS os dados do ano afetado em batches (SELECT paginado)
 *   3. Para cada linha: corrige rras + drs + regiao_ad/sa + cod_ibge via lookup
 *   4. Deleta o ano via lc131_delete_year (SECURITY DEFINER)
 *   5. Re-insere com os dados corrigidos
 *   6. Executa refresh_dashboard_batch em loop para preencher restantes
 *
 * USO:
 *   $env:NODE_TLS_REJECT_UNAUTHORIZED="0"
 *   node scripts/fix-rras-reimport.mjs [ano]
 *
 * Exemplos:
 *   node scripts/fix-rras-reimport.mjs 2026
 *   node scripts/fix-rras-reimport.mjs 2024
 *   node scripts/fix-rras-reimport.mjs        ← processa todos os anos com RRAS ruim
 * ─────────────────────────────────────────────────────────────────────────────
 */

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
import { createClient } from '@supabase/supabase-js';

const SUPA_URL = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODkwNDQsImV4cCI6MjA5MTM2NTA0NH0.t3tWIh3F9lmg-a6zzdmoKpupHB9i7hTfvFmPyFbZNZs';

const sb = createClient(SUPA_URL, SUPA_KEY);

const PAGE_SIZE  = 1000;   // PostgREST max por request
const INS_CHUNK  = 500;    // chunks de inserção

// Colunas que NÃO devem ser re-inseridas (auto-geradas pelo banco)
const SKIP_COLS  = new Set(['id']);

// ─────────────────────────────────────────────────────────────────────────────
// Normaliza nome de município para chave do lookup (igual a norm_munic no DB)
// ─────────────────────────────────────────────────────────────────────────────
function normMunic(t) {
  return String(t ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().trim().replace(/\s+/g, ' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Carregar tab_municipios em memória
// ─────────────────────────────────────────────────────────────────────────────
async function loadMunicipios() {
  console.log('Carregando tab_municipios...');
  const { data, error } = await sb.from('tab_municipios')
    .select('municipio,drs,rras,regiao_ad,regiao_sa,cod_ibge,municipio_orig')
    .limit(1000);
  if (error) throw new Error('tab_municipios: ' + error.message);
  const map = new Map();
  for (const row of data) map.set(row.municipio, row);
  console.log(`  → ${map.size} municípios carregados\n`);
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Ler TODOS os dados de um ano (paginado)
// ─────────────────────────────────────────────────────────────────────────────
async function readYear(ano) {
  console.log(`Lendo linhas do ano ${ano}...`);
  const { count } = await sb.from('lc131_despesas')
    .select('*', { count: 'exact', head: true })
    .eq('ano_referencia', ano);
  console.log(`  → ${count} linhas totais`);

  const all = [];
  const pages = Math.ceil(count / PAGE_SIZE);
  for (let p = 0; p < pages; p++) {
    const from = p * PAGE_SIZE;
    const to   = from + PAGE_SIZE - 1;
    process.stdout.write(`  Página ${p + 1}/${pages}...  \r`);
    const { data, error } = await sb.from('lc131_despesas')
      .select('*').eq('ano_referencia', ano).range(from, to);
    if (error) throw new Error(`Página ${p}: ${error.message}`);
    all.push(...data);
  }
  console.log(`\n  → ${all.length} linhas lidas\n`);
  return all;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Corrigir RRAS e dados geográficos em memória
// ─────────────────────────────────────────────────────────────────────────────
function fixRows(rows, muniMap) {
  let fixedRras = 0, fixedGeo = 0;

  const fixed = rows.map(row => {
    // Clonar sem o id (auto-gerado)
    const out = Object.fromEntries(
      Object.entries(row).filter(([k]) => !SKIP_COLS.has(k))
    );

    // Lookup do município na tabela de referência
    const key1 = normMunic(row.nome_municipio);
    const key2 = normMunic(row.municipio);
    const ref  = muniMap.get(key1) || muniMap.get(key2);

    if (ref) {
      // Sempre sobrescreve dados geográficos com a fonte oficial
      out.drs       = ref.drs;
      out.rras      = ref.rras;      // sempre 'RRAS XX' format
      out.regiao_ad = ref.regiao_ad;
      out.regiao_sa = ref.regiao_sa;
      out.cod_ibge  = ref.cod_ibge;
      fixedGeo++;
    } else if (/^\d{1,2}$/.test(String(row.rras ?? ''))) {
      // Sem match no lookup mas rras é numérico: formata como 'RRAS XX'
      out.rras = 'RRAS ' + String(row.rras).padStart(2, '0');
      fixedRras++;
    }

    return out;
  });

  console.log(`  → ${fixedGeo} linhas corrigidas via tab_municipios`);
  console.log(`  → ${fixedRras} linhas com RRAS numérico normalizado (sem match geográfico)\n`);
  return fixed;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Deletar o ano
// ─────────────────────────────────────────────────────────────────────────────
async function deleteYear(ano) {
  console.log(`Deletando ano ${ano}...`);
  const { data, error } = await sb.rpc('lc131_delete_year', { p_ano: ano });
  if (error) throw new Error('delete_year: ' + error.message);
  console.log(`  → ${data} linhas deletadas\n`);
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Re-inserir em chunks
// ─────────────────────────────────────────────────────────────────────────────
async function reinsert(rows) {
  console.log(`Re-inserindo ${rows.length} linhas...`);
  let ok = 0, errs = 0;
  for (let i = 0; i < rows.length; i += INS_CHUNK) {
    const chunk = rows.slice(i, i + INS_CHUNK);
    process.stdout.write(`  Chunk ${Math.floor(i / INS_CHUNK) + 1}/${Math.ceil(rows.length / INS_CHUNK)}  \r`);
    const { error } = await sb.from('lc131_despesas').insert(chunk);
    if (error) {
      console.error(`\n  ERRO no chunk ${Math.floor(i / INS_CHUNK) + 1}: ${error.message}`);
      errs++;
    } else {
      ok += chunk.length;
    }
  }
  console.log(`\n  → ${ok} linhas inseridas, ${errs} chunks com erro\n`);
  if (errs > 0) throw new Error(`${errs} chunks falharam na re-inserção. Dados podem estar incompletos!`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Enriquecimento final via refresh_dashboard_batch
// ─────────────────────────────────────────────────────────────────────────────
async function runEnrich(maxIterations = 100) {
  console.log('Rodando refresh_dashboard_batch em loop...');
  let total = 0;
  for (let i = 0; i < maxIterations; i++) {
    const r = await fetch(`${SUPA_URL}/rest/v1/rpc/refresh_dashboard_batch`, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_batch_size: 5000 }),
    });
    const count = parseInt(await r.text()) || 0;
    total += count;
    process.stdout.write(`  Batch ${i + 1}: ${count} (total: ${total})  \r`);
    if (count === 0) { console.log(`\n  → Enriquecimento completo! Total: ${total} linhas\n`); return; }
  }
  console.log(`\n  → Max iterações atingido. Total: ${total}\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Verificação final — mostra RRAS distintos por ano
// ─────────────────────────────────────────────────────────────────────────────
async function verifyYear(ano) {
  const r = await sb.rpc('lc131_distincts', { p_ano: ano });
  if (r.error) { console.log(`  ${ano}: ERROR - ${r.error.message}`); return; }
  const vals = r.data.distinct_rras || [];
  const bad  = vals.filter(v => /^\d+$/.test(v));
  console.log(`  ${ano}: ${vals.length} RRAS distintos${bad.length ? ' ⚠️  BAD: ' + bad.join(',') : ' ✅'}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function processYear(ano, muniMap) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  PROCESSANDO ANO ${ano}`);
  console.log(`${'═'.repeat(60)}\n`);

  // Verificar se há RRAS bad antes de prosseguir
  const sample = await sb.from('lc131_despesas')
    .select('rras').eq('ano_referencia', ano).limit(5000);
  const hasBad = sample.data?.some(r => /^\d+$/.test(String(r.rras ?? '')));

  if (!hasBad) {
    console.log(`  ✅ Ano ${ano}: sem RRAS em formato numérico. Pulando.\n`);
    return;
  }

  // Mostrar valores ruins encontrados
  const badVals = [...new Set(sample.data.filter(r => /^\d+$/.test(String(r.rras ?? ''))).map(r => r.rras))];
  console.log(`  ⚠️  RRAS numérico encontrado na amostra: ${badVals.join(', ')}\n`);

  // PASSO 1: Ler todos os dados
  const rows = await readYear(ano);

  // PASSO 2: Corrigir em memória
  console.log('Corrigindo dados em memória...');
  const fixed = fixRows(rows, muniMap);

  // PASSO 3: Deletar ano
  await deleteYear(ano);

  // PASSO 4: Re-inserir
  await reinsert(fixed);

  // PASSO 5: Enriquecer vazios
  await runEnrich(50);

  // Verificar
  console.log('Verificação pós-fix:');
  await verifyYear(ano);
}

async function main() {
  const argAno = process.argv[2] ? parseInt(process.argv[2]) : null;
  const anos   = argAno ? [argAno] : [2022, 2023, 2024, 2025, 2026];

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  FIX RRAS — Correção via DELETE + RE-INSERT');
  console.log(`  Anos: ${anos.join(', ')}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // Carregar referência geográfica
  const muniMap = await loadMunicipios();

  for (const ano of anos) {
    await processYear(ano, muniMap);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Verificação final por ano:');
  for (const ano of [2022, 2023, 2024, 2025, 2026]) {
    await verifyYear(ano);
  }
  console.log('\n✅ CONCLUÍDO!');
  console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\n❌ Erro fatal:', err.message);
  process.exit(1);
});
