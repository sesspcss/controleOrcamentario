/**
 * fix-dup-2026.mjs
 * -------------------------------------------------------------------------
 * Corrige duplicação de dados de 2026:
 *   1. Deleta TODOS os registros onde ano_referencia = 2026
 *   2. Reimporta o arquivo Excel limpo, sem duplicatas
 *
 * USO:
 *   $env:NODE_TLS_REJECT_UNAUTHORIZED="0"
 *   node scripts/fix-dup-2026.mjs "C:\caminho\para\LC_131_2026.xlsx"
 * -------------------------------------------------------------------------
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const SUPA_URL = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODkwNDQsImV4cCI6MjA5MTM2NTA0NH0.t3tWIh3F9lmg-a6zzdmoKpupHB9i7hTfvFmPyFbZNZs';
const CHUNK_SIZE = 500;

const sb = createClient(SUPA_URL, SUPA_KEY);

// ─── Validação do argumento ───────────────────────────────────────────────────
const filePath = process.argv[2];
if (!filePath) {
  console.error('❌  Informe o arquivo 2026:');
  console.error('    node scripts/fix-dup-2026.mjs "C:\\caminho\\LC_131_2026.xlsx"');
  process.exit(1);
}
if (!fs.existsSync(filePath)) {
  console.error(`❌  Arquivo não encontrado: ${filePath}`);
  process.exit(1);
}

// ─── Normalização de colunas ──────────────────────────────────────────────────
function toSnake(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '').replace(/__+/g, '_') || 'col_vazia';
}

// Colunas válidas na tabela lc131_despesas
const VALID_COLUMNS = new Set([
  'ano_referencia', 'nome_municipio', 'codigo_nome_uo', 'codigo_ug', 'codigo_nome_ug',
  'codigo_projeto_atividade', 'codigo_nome_projeto_atividade', 'codigo_nome_fonte_recurso',
  'codigo_nome_grupo', 'codigo_nome_elemento', 'codigo_elemento',
  'codigo_nome_favorecido', 'codigo_favorecido', 'empenhado', 'liquidado',
  'pago', 'pago_anos_anteriores',
]);

// Colunas numéricas (conversão obrigatória)
const NUMERIC_COLS = new Set([
  'empenhado', 'liquidado', 'pago', 'pago_anos_anteriores',
  'codigo_ug', 'codigo_projeto_atividade', 'codigo_elemento', 'ano_referencia',
]);

// ─── Passo 1: Deletar todos os registros de 2026 via RPC ─────────────────────
async function deletar2026() {
  console.log('\n🗑️  [1/3] Verificando e deletando registros de 2026...');

  const { count: antes, error: errCount } = await sb
    .from('lc131_despesas')
    .select('*', { count: 'exact', head: true })
    .eq('ano_referencia', 2026);

  if (errCount) {
    console.error(`   ❌ Erro ao contar: ${errCount.message}`);
    process.exit(1);
  }

  console.log(`   Registros 2026 encontrados: ${antes}`);

  if (antes === 0) {
    console.log('   ℹ️  Nenhum registro de 2026. Prosseguindo com importação.');
    return;
  }

  // Usa RPC SECURITY DEFINER (contorna RLS)
  console.log('   Chamando lc131_delete_year(2026) via RPC...');
  const { data: deletados, error: errRpc } = await sb.rpc('lc131_delete_year', { p_ano: 2026 });

  if (errRpc) {
    console.error(`   ❌ RPC falhou: ${errRpc.message}`);
    console.error('\n   Execute este SQL no Supabase SQL Editor e rode o script novamente:');
    console.error('   ┌──────────────────────────────────────────────────────────────────────┐');
    console.error('   │  DELETE FROM public.lc131_despesas WHERE ano_referencia = 2026;      │');
    console.error('   └──────────────────────────────────────────────────────────────────────┘');
    process.exit(1);
  }

  console.log(`   → RPC retornou: ${deletados} registros deletados`);

  // Verificação final
  const { count: depois } = await sb
    .from('lc131_despesas')
    .select('*', { count: 'exact', head: true })
    .eq('ano_referencia', 2026);

  console.log(`   ✅ Restam: ${depois ?? 0} registros de 2026`);

  if ((depois ?? 0) > 0) {
    console.error(`\n   ❌ Ainda restam ${depois} registros. Execute no Supabase SQL Editor:`);
    console.error('   DELETE FROM public.lc131_despesas WHERE ano_referencia = 2026;');
    process.exit(1);
  }
}

// ─── Passo 2: Ler o arquivo Excel ────────────────────────────────────────────
function lerExcel(filePath) {
  console.log(`\n📂 [2/3] Lendo arquivo: ${path.basename(filePath)}`);

  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Detecta automaticamente a linha de cabeçalho
  let headerIdx = 0;
  for (let i = 0; i < Math.min(10, matrix.length); i++) {
    const row = matrix[i];
    const nonEmpty = row.filter(v => v !== '' && v != null);
    const textCells = nonEmpty.filter(v => typeof v === 'string' && isNaN(Number(v)));
    if (nonEmpty.length > 3 && textCells.length / nonEmpty.length > 0.6) {
      headerIdx = i;
      break;
    }
  }

  const rawHeaders = matrix[headerIdx].map(String);
  const headers = rawHeaders.map(h => toSnake(h));
  console.log(`   → Cabeçalho na linha ${headerIdx + 1}: ${rawHeaders.slice(0, 5).join(' | ')} ...`);

  const validCols = headers.filter(h => VALID_COLUMNS.has(h));
  const skippedCols = headers.filter(h => !VALID_COLUMNS.has(h) && h && h !== 'col_vazia');
  if (skippedCols.length) console.log(`   ⚠️  Colunas ignoradas: ${skippedCols.join(', ')}`);
  console.log(`   → ${validCols.length} colunas válidas de ${headers.length}`);

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
      if (!key || !validCols.includes(key)) continue;
      let val = raw[c];
      if (NUMERIC_COLS.has(key)) {
        if (val === '' || val === null || val === undefined) val = null;
        else val = Number(val);
      } else {
        if (val === '') val = null;
      }
      obj[key] = val;
    }
    rows.push(obj);
  }

  console.log(`   → ${rows.length.toLocaleString('pt-BR')} registros lidos`);
  return rows;
}

// ─── Passo 3: Inserir os dados ───────────────────────────────────────────────
async function inserir(rows) {
  console.log(`\n⬆️  [3/3] Inserindo ${rows.length.toLocaleString('pt-BR')} registros...`);

  let inseridos = 0;
  let erros = 0;

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await sb.from('lc131_despesas').insert(chunk);
    if (error) {
      console.error(`\n   ❌ Chunk ${Math.floor(i / CHUNK_SIZE) + 1}: ${error.message}`);
      erros++;
      if (erros > 5) {
        console.error('   Muitos erros consecutivos. Abortando.');
        process.exit(1);
      }
    } else {
      inseridos += chunk.length;
    }
    process.stdout.write(`\r   → ${inseridos.toLocaleString('pt-BR')} / ${rows.length.toLocaleString('pt-BR')} inseridos`);
  }

  console.log(`\n   ✅ ${inseridos.toLocaleString('pt-BR')} registros inseridos. (${erros} erros)`);
  return inseridos;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════════');
console.log('  FIX DUPLICATAS 2026  →  Supabase (teikzwrfsxjipxozzhbr)');
console.log('══════════════════════════════════════════════════════════════');

await deletar2026();
const rows = lerExcel(filePath);
const inseridos = await inserir(rows);

// Verificação final
const { count: c2026 } = await sb.from('lc131_despesas').select('*', { count: 'exact', head: true }).eq('ano_referencia', 2026);
const { count: cTotal } = await sb.from('lc131_despesas').select('*', { count: 'exact', head: true });

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  RESULTADO FINAL');
console.log('══════════════════════════════════════════════════════════════');
console.log(`  Registros 2026 : ${c2026?.toLocaleString('pt-BR') ?? '?'}`);
console.log(`  Total geral    : ${cTotal?.toLocaleString('pt-BR') ?? '?'}`);
console.log('══════════════════════════════════════════════════════════════');

if (inseridos > 0) {
  console.log('\n✅ Concluído! Execute o enriquecimento para preencher os campos derivados:');
  console.log('   $env:NODE_TLS_REJECT_UNAUTHORIZED="0"; node scripts/run-enrich.mjs');
}
