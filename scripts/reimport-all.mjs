/**
 * reimport-all.mjs
 * -----------------------------------------------------------------------
 * Re-importa TODOS os anos (2022-2026) para incluir descricao_processo
 * e numero_processo que estavam NULL no banco.
 *
 * Estratégia:
 *   1. lc131_delete_year (SECURITY DEFINER) deleta os registros do ano
 *   2. INSERT dos dados do Excel (anon tem permissão INSERT via RLS)
 *   3. refresh_dashboard_batch preenche colunas de enriquecimento
 *
 * USO:
 *   node scripts/reimport-all.mjs
 * -----------------------------------------------------------------------
 */

import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

const require2 = createRequire(import.meta.url);
const XLSX = require2('xlsx');

const SUPABASE_URL = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODkwNDQsImV4cCI6MjA5MTM2NTA0NH0.t3tWIh3F9lmg-a6zzdmoKpupHB9i7hTfvFmPyFbZNZs';
const CHUNK_SIZE = 200;
const CONCURRENCY = 1;   // sequential to avoid overload

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const YEARS = [
  { ano: 2022, file: 'C:\\Users\\afpereira\\Downloads\\LC31\\LC_131_2022.xlsx' },
  { ano: 2023, file: 'C:\\Users\\afpereira\\Downloads\\LC31\\LC_131_2023.xlsx' },
  { ano: 2024, file: 'C:\\Users\\afpereira\\Downloads\\LC31\\LC_131_2024.xlsx' },
  { ano: 2025, file: 'C:\\Users\\afpereira\\Downloads\\LC31\\LC_131_2025.xlsx' },
  { ano: 2026, file: 'C:\\Users\\afpereira\\Downloads\\LC31\\LC_131_2026.xlsx' },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

function toSnake(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function isNumericCol(vals) {
  const ne = vals.filter(v => v !== '' && v != null);
  if (!ne.length) return false;
  return ne.every(v => !isNaN(Number(String(v).replace(',', '.'))));
}

function readLcXlsx(filePath, ano) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Auto-detect header row
  let headerIdx = 0;
  for (let i = 0; i < Math.min(10, matrix.length); i++) {
    const row = matrix[i];
    const nonEmpty = row.filter(v => v !== '' && v != null);
    const textCells = nonEmpty.filter(v => typeof v === 'string' && isNaN(Number(v)));
    if (nonEmpty.length > 3 && textCells.length / nonEmpty.length > 0.6) {
      headerIdx = i; break;
    }
  }

  const rawHeaders = matrix[headerIdx].map(String);
  const headers = rawHeaders.map(h => toSnake(h));

  // Detect numeric columns from sample
  const sampleStart = headerIdx + 1;
  const numCols = new Set(headers.filter((h, idx) => {
    return isNumericCol(
      matrix.slice(sampleStart, sampleStart + 100).map(r => r[idx])
    );
  }));

  const SKIP_PREFIXES = ['total geral', 'subtotal', 'total'];
  const rows = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const raw = matrix[i];
    const first = String(raw[0] ?? '').trim().toLowerCase();
    if (SKIP_PREFIXES.some(p => first.startsWith(p))) continue;
    if (raw.every(v => v === '' || v == null)) continue;

    const obj = { ano_referencia: ano };
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      const val = raw[c];
      if (numCols.has(key)) {
        if (val === '' || val == null) {
          obj[key] = null;
        } else {
          const n = Number(String(val).replace(',', '.'));
          obj[key] = isNaN(n) ? null : n;
        }
      } else {
        obj[key] = (val === '' || val == null) ? null : String(val).trim();
      }
    }
    rows.push(obj);
  }

  return { rows, headers };
}

// ─── Parallel INSERT with concurrency limit ───────────────────────────────

async function insertParallel(rows, label) {
  let inserted = 0;
  let errors = 0;
  const chunks = [];
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    chunks.push(rows.slice(i, i + CHUNK_SIZE));
  }

  let idx = 0;
  async function worker() {
    while (idx < chunks.length) {
      const ci = idx++;
      const chunk = chunks[ci];
      for (let attempt = 0; attempt < 3; attempt++) {
        const { error } = await sb.from('lc131_despesas').insert(chunk);
        if (!error) {
          inserted += chunk.length;
          break;
        }
        if (attempt === 2) {
          console.error(`\n   ❌ Chunk ${ci}: ${error.message.substring(0, 150)}`);
          errors++;
        }
      }
      process.stdout.write(`\r   ${label}: ${inserted.toLocaleString('pt-BR')}/${rows.length.toLocaleString('pt-BR')} inseridos (${errors} erros)`);
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, () => worker());
  await Promise.all(workers);
  console.log();
  return { inserted, errors };
}

// ─── Discover valid DB columns ────────────────────────────────────────────

async function getDbColumns() {
  // Fetch a single row to discover column names
  const { data, error } = await sb.from('lc131_despesas')
    .select('*')
    .limit(1);
  if (error || !data?.length) {
    // Fallback: hardcoded known columns
    return new Set([
      'ano_referencia', 'nome_municipio', 'codigo_nome_uo', 'codigo_ug',
      'codigo_nome_ug', 'codigo_projeto_atividade', 'codigo_nome_projeto_atividade',
      'codigo_nome_fonte_recurso', 'codigo_nome_grupo', 'codigo_nome_elemento',
      'codigo_elemento', 'codigo_nome_favorecido', 'codigo_favorecido',
      'empenhado', 'liquidado', 'pago', 'pago_anos_anteriores',
      'descricao_processo', 'numero_processo',
    ]);
  }
  const cols = new Set(Object.keys(data[0]));
  cols.delete('id'); // auto-generated
  return cols;
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  REIMPORT ALL YEARS (2022-2026)');
  console.log('  → Fix descricao_processo + numero_processo');
  console.log('═══════════════════════════════════════════════════════\n');

  // Discover which columns the DB table accepts
  const dbCols = await getDbColumns();
  console.log(`   DB tem ${dbCols.size} colunas`);

  const t0 = Date.now();
  let totalInserted = 0;
  let totalErrors = 0;

  for (const { ano, file } of YEARS) {
    console.log(`\n──── ANO ${ano} ────────────────────────────────────`);

    // 1. Skip delete — DB is fresh (new project)
    console.log(`   DB novo — sem necessidade de deletar.`);

    // 2. Read Excel
    process.stdout.write(`   Lendo Excel...`);
    const { rows, headers } = readLcXlsx(file, ano);
    console.log(` ${rows.length.toLocaleString('pt-BR')} linhas, ${headers.length} colunas`);

    // Filter out columns not in DB
    const excelOnly = headers.filter(h => !dbCols.has(h) && h !== 'ano_referencia');
    if (excelOnly.length) {
      console.log(`   ⚠️  Colunas ignoradas (não existem no DB): ${excelOnly.join(', ')}`);
    }
    const cleanRows = rows.map(r => {
      const clean = {};
      for (const key of Object.keys(r)) {
        if (dbCols.has(key) || key === 'ano_referencia') {
          clean[key] = r[key];
        }
      }
      return clean;
    });

    // Show processo column presence
    const hasDesc = headers.includes('descricao_processo');
    const hasNum = headers.includes('numero_processo');
    console.log(`   descricao_processo: ${hasDesc ? '✅ presente' : '❌ AUSENTE'}`);
    console.log(`   numero_processo:    ${hasNum ? '✅ presente' : '❌ AUSENTE'}`);

    // Sample
    if (rows.length > 0) {
      const sample = rows[0];
      console.log(`   Amostra: desc="${sample.descricao_processo}", num="${sample.numero_processo}"`);
    }

    // 3. Insert
    const { inserted, errors } = await insertParallel(cleanRows, `${ano}`);
    totalInserted += inserted;
    totalErrors += errors;
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(`  RESULTADO: ${totalInserted.toLocaleString('pt-BR')} inseridos, ${totalErrors} erros`);
  console.log(`  Tempo: ${elapsed}s`);
  console.log(`═══════════════════════════════════════════════════════\n`);

  // 4. Refresh dashboard (enrich DRS, RRAS, etc.)
  console.log('🔄  Executando refresh_dashboard_batch...');
  let totalRefreshed = 0;
  for (let i = 0; i < 200; i++) {
    const { data, error } = await sb.rpc('refresh_dashboard_batch', { batch_size: 5000 });
    if (error) {
      console.log(`   ⚠️  refresh_dashboard_batch erro: ${error.message}`);
      console.log('   → Tente executar refresh_dashboard() no SQL Editor');
      break;
    }
    const n = Number(data);
    totalRefreshed += n;
    process.stdout.write(`\r   ${totalRefreshed.toLocaleString('pt-BR')} registros enriquecidos...`);
    if (n === 0) break;
  }
  console.log(`\n   ✅ Enriquecimento concluído: ${totalRefreshed.toLocaleString('pt-BR')} registros`);

  // 5. Quick verification
  console.log('\n📊  VERIFICAÇÃO:');
  for (const { ano } of YEARS) {
    const { data, error } = await sb.from('lc131_despesas')
      .select('id,descricao_processo,numero_processo', { count: 'exact', head: false })
      .eq('ano_referencia', ano)
      .not('descricao_processo', 'is', null)
      .limit(1);
    const { count } = await sb.from('lc131_despesas')
      .select('id', { count: 'exact', head: true })
      .eq('ano_referencia', ano);
    const filled = data?.length ? '✅ preenchido' : '❌ vazio';
    console.log(`   ${ano}: ${count?.toLocaleString('pt-BR') ?? '?'} registros, descricao_processo: ${filled}`);
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
