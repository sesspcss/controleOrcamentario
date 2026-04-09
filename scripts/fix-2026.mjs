/**
 * fix-2026.mjs
 * -----------------------------------------------------------------------
 * 1. Deleta todos os registros de 2026 (duplicados)
 * 2. Re-importa a planilha correta
 * 3. Chama refresh_dashboard()
 * -----------------------------------------------------------------------
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

const require2 = createRequire(import.meta.url);
const XLSX = require2('xlsx');

const SUPABASE_URL = 'https://odnstbeuiojohutoqvvw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kbnN0YmV1aW9qb2h1dG9xdnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTQ1NzgsImV4cCI6MjA5MDA5MDU3OH0._71Nt-rjs3EvOuDcGcQcPFKug-iDg_dEs38UVLBLJEQ';
const CHUNK_SIZE = 500;

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Helpers ───────────────────────────────────────────────────────────────

function toSnake(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function readLcXlsx(filePath, ano) {
  console.log(`\n📂  Lendo: ${path.basename(filePath)}`);
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

    const obj = { ano_referencia: ano };
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      const val = raw[c];
      obj[key] = typeof val === 'number' ? val : String(val ?? '').trim();
    }
    rows.push(obj);
  }
  console.log(`   → ${rows.length} registros lidos (excluindo Total Geral)`);
  return { rows, headers };
}

async function validateColumns(sb2, table, columns) {
  const test = {};
  columns.forEach(c => test[c] = null);
  const { error } = await sb2.from(table).insert(test);
  if (!error) {
    // inserted a null row, delete it
    const { data } = await sb2.from(table).select('id').order('id', { ascending: false }).limit(1).single();
    if (data?.id) await sb2.from(table).delete().eq('id', data.id);
    return columns;
  }
  const m = error.message.match(/column [\w.]*\.(\w+) does not exist/i) || error.message.match(/column "(\w+)" .* does not exist/i);
  if (m) {
    console.log(`   ⚠️  Coluna "${m[1]}" não existe na tabela — removendo`);
    const bad = m[1];
    return validateColumns(sb2, table, columns.filter(c => c !== bad));
  }
  return columns;
}

// ─── STEP 1: Delete all 2026 records ──────────────────────────────────────

async function deleteAll2026() {
  console.log('\n🗑️   STEP 1: Deletando todos os registros de 2026...');
  
  const { data: deleted, error } = await sb.rpc('lc131_delete_year', { p_ano: 2026 });
  if (error) {
    console.error('   ❌ Erro:', error.message);
    throw error;
  }
  console.log(`   ✅ ${deleted} registros de 2026 deletados`);
}

// ─── STEP 2: Re-import ────────────────────────────────────────────────────

async function reimport(filePath) {
  console.log('\n📥  STEP 2: Re-importando planilha 2026...');
  
  const { rows, headers } = readLcXlsx(filePath, 2026);
  
  // Validate columns
  const validCols = await validateColumns(sb, 'lc131_despesas', headers);
  console.log(`   → ${validCols.length} colunas válidas de ${headers.length}`);
  
  // Strip invalid columns
  const cleanRows = rows.map(r => {
    const clean = { ano_referencia: r.ano_referencia };
    for (const col of validCols) {
      if (col in r) clean[col] = r[col];
    }
    return clean;
  });
  
  // Insert in chunks
  let inserted = 0;
  let errors = 0;
  for (let i = 0; i < cleanRows.length; i += CHUNK_SIZE) {
    const chunk = cleanRows.slice(i, i + CHUNK_SIZE);
    const { error } = await sb.from('lc131_despesas').insert(chunk);
    if (error) {
      console.error(`\n   ❌ Chunk ${Math.floor(i / CHUNK_SIZE) + 1}: ${error.message}`);
      errors++;
    } else {
      inserted += chunk.length;
    }
    process.stdout.write(`\r   → ${inserted} inseridos, ${errors} erros`);
  }
  console.log(`\n   ✅ ${inserted} registros inseridos`);
  return inserted;
}

// ─── STEP 3: Refresh dashboard ────────────────────────────────────────────

async function refreshDashboard() {
  console.log('\n🔄  STEP 3: Executando refresh_dashboard()...');
  const { error } = await sb.rpc('refresh_dashboard');
  if (error) {
    console.error(`   ⚠️  refresh_dashboard timeout/erro: ${error.message}`);
    console.log('   → Execute manualmente no SQL Editor: SELECT refresh_dashboard();');
  } else {
    console.log('   ✅ refresh_dashboard concluído!');
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────

const filePath = process.argv[2];
if (!filePath || !fs.existsSync(filePath)) {
  console.error('❌ Informe o caminho da planilha 2026:');
  console.error('   npx tsx scripts/fix-2026.mjs "C:\\...\\LC 131 - Despesas - região (3).xlsx"');
  process.exit(1);
}

console.log('═══════════════════════════════════════════════════');
console.log('  FIX 2026: Remover duplicatas e re-importar');
console.log('═══════════════════════════════════════════════════');

await deleteAll2026();
await reimport(filePath);
await refreshDashboard();

// Verify
console.log('\n📊  VERIFICAÇÃO:');
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
