import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

const require2 = createRequire(import.meta.url);
const XLSX = require2('xlsx');

const sb = createClient(
  'https://teikzwrfsxjipxozzhbr.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODkwNDQsImV4cCI6MjA5MTM2NTA0NH0.t3tWIh3F9lmg-a6zzdmoKpupHB9i7hTfvFmPyFbZNZs'
);

const CHUNK_SIZE = 500;

function toSnake(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// Check current state
const { count } = await sb.from('lc131_despesas').select('*', { count: 'exact', head: true }).eq('ano_referencia', 2026);
console.log(`\n📊 Registros 2026 atuais: ${count}`);

if (count > 0) {
  console.log(`🗑️  Deletando ${count} registros de 2026 via lc131_delete_year...`);
  const { error: delErr } = await sb.rpc('lc131_delete_year', { p_ano: 2026 });
  if (delErr) {
    console.error(`❌ Erro ao deletar: ${delErr.message}`);
    process.exit(1);
  }
  const { count: remaining } = await sb.from('lc131_despesas').select('*', { count: 'exact', head: true }).eq('ano_referencia', 2026);
  console.log(`   ✅ Deletados. Restam: ${remaining ?? 0} registros de 2026`);
}

// Read Excel
const filePath = process.argv[2];
if (!filePath || !fs.existsSync(filePath)) {
  console.error('❌ Informe o caminho: npx tsx scripts/reimport-2026.mjs "caminho.xlsx"');
  process.exit(1);
}

console.log(`\n📂 Lendo: ${path.basename(filePath)}`);
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
console.log(`   → Cabeçalho na linha ${headerIdx + 1}: ${rawHeaders.slice(0, 5).join(' | ')} ...`);

const SKIP_PREFIXES = ['total geral', 'subtotal', 'total'];
const rows = [];
for (let i = headerIdx + 1; i < matrix.length; i++) {
  const raw = matrix[i];
  const first = String(raw[0] ?? '').trim().toLowerCase();
  if (SKIP_PREFIXES.some(p => first.startsWith(p))) continue;
  if (raw.every(v => v === '' || v == null)) continue;

  const obj = { ano_referencia: 2026 };
  for (let c = 0; c < headers.length; c++) {
    const key = headers[c];
    if (!key) continue;
    const val = raw[c];
    obj[key] = typeof val === 'number' ? val : String(val ?? '').trim();
  }
  rows.push(obj);
}
console.log(`   → ${rows.length} registros lidos`);

// Known columns that exist in lc131_despesas table
const VALID_COLUMNS = new Set([
  'ano_referencia', 'nome_municipio', 'codigo_nome_uo', 'codigo_ug', 'codigo_nome_ug',
  'codigo_projeto_atividade', 'codigo_nome_projeto_atividade', 'codigo_nome_fonte_recurso',
  'codigo_nome_grupo', 'codigo_nome_elemento', 'codigo_elemento',
  'codigo_nome_favorecido', 'codigo_favorecido', 'empenhado', 'liquidado',
  'pago', 'pago_anos_anteriores'
]);

const validCols = headers.filter(h => VALID_COLUMNS.has(h));
const skippedCols = headers.filter(h => !VALID_COLUMNS.has(h) && h);
if (skippedCols.length) console.log(`   ⚠️  Colunas ignoradas: ${skippedCols.join(', ')}`);
console.log(`   → ${validCols.length} colunas válidas de ${headers.length}`);

// Numeric columns that need null conversion
const NUMERIC_COLS = new Set([
  'empenhado', 'liquidado', 'pago', 'pago_anos_anteriores',
  'codigo_ug', 'codigo_projeto_atividade', 'codigo_elemento', 'ano_referencia'
]);

// Strip invalid columns and fix numeric types
const cleanRows = rows.map(r => {
  const clean = { ano_referencia: r.ano_referencia };
  for (const col of validCols) {
    if (col in r) {
      let val = r[col];
      if (NUMERIC_COLS.has(col)) {
        if (val === '' || val === null || val === undefined) val = null;
        else val = Number(val);
      } else {
        if (val === '') val = null;
      }
      clean[col] = val;
    }
  }
  return clean;
});

// Insert in chunks
let inserted = 0;
let errors = 0;
console.log(`\n⬆️  Inserindo ${cleanRows.length} registros...`);
for (let i = 0; i < cleanRows.length; i += CHUNK_SIZE) {
  const chunk = cleanRows.slice(i, i + CHUNK_SIZE);
  const { error } = await sb.from('lc131_despesas').insert(chunk);
  if (error) {
    console.error(`\n   ❌ Chunk ${Math.floor(i / CHUNK_SIZE) + 1}: ${error.message}`);
    errors++;
    if (errors > 3) { console.error('Muitos erros, abortando.'); break; }
  } else {
    inserted += chunk.length;
  }
  process.stdout.write(`\r   → ${inserted} inseridos, ${errors} erros`);
}
console.log(`\n   ✅ ${inserted} registros inseridos`);

// Run refresh_dashboard
console.log('\n🔄 Executando refresh_dashboard()...');
const { error: refreshErr } = await sb.rpc('refresh_dashboard');
if (refreshErr) {
  console.error(`   ⚠️  Timeout/erro: ${refreshErr.message}`);
  console.log('   → Execute no SQL Editor: SELECT refresh_dashboard();');
} else {
  console.log('   ✅ refresh_dashboard concluído!');
}

// Verify
console.log('\n📊 VERIFICAÇÃO:');
const { data: kpi } = await sb.rpc('lc131_dashboard', { p_ano: 2026 });
const k = kpi?.kpis;
console.log(`   Empenhado:  ${Number(k?.empenhado || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
console.log(`   Liquidado:  ${Number(k?.liquidado || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
console.log(`   Pago:       ${Number(k?.pago || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
console.log(`   Pago Total: ${Number(k?.pago_total || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
console.log(`   Registros:  ${k?.total}`);
console.log(`   Municípios: ${k?.municipios}`);
console.log('\n   ESPERADO:');
console.log(`   Empenhado:  19.713.894.203,10`);
console.log(`   Liquidado:  9.051.086.795,07`);
console.log(`   Pago:       8.496.942.368,33`);
console.log(`   Pago Total: 11.140.095.597,51`);
console.log(`   Registros:  ~40.354`);
