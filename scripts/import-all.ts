/**
 * import-all.ts
 * -----------------------------------------------------------------------
 * Script de importação completa (batch): DRS + RRAS + todos os arquivos LC 131.
 *
 * USO:
 *   npx tsx scripts/import-all.ts \
 *     --drs    "C:/Downloads/LC31/DRS.xlsx"   \
 *     --rras   "C:/Downloads/LC31/RRAS.xlsx"  \
 *     --lc2022 "C:/Downloads/LC31/LC_131_2022.xlsx" \
 *     --lc2023 "C:/Downloads/LC31/LC_131_2023.xlsx" \
 *     --lc2024 "C:/Downloads/LC31/LC_131_2024.xlsx" \
 *     --lc2025 "C:/Downloads/LC31/LC_131_2025.xlsx" \
 *     --lc2026 "C:/Downloads/LC31/LC_131_2026.xlsx"
 *
 * FLAGS OPCIONAIS:
 *   --no-truncate    Não apaga os dados LC131 existentes (só faz append)
 *   --skip-drs-rras  Pula a importação de DRS e RRAS (se já importados)
 *   --skip-lc        Pula a importação das planilhas LC131
 *   --incremental    Importa apenas registros novos (sem duplicar existentes)
 *
 * SEQUÊNCIA DE EXECUÇÃO:
 *   1. Execute supabase_setup.sql completo no Supabase SQL Editor
 *   2. Execute este script
 * -----------------------------------------------------------------------
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';

// Bypass SSL interception by corporate proxies (local admin script only)
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx') as typeof import('xlsx');

// ─── Configuração Supabase ───────────────────────────────────────────────────
const SUPABASE_URL = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODkwNDQsImV4cCI6MjA5MTM2NTA0NH0.t3tWIh3F9lmg-a6zzdmoKpupHB9i7hTfvFmPyFbZNZs';
const CHUNK_SIZE   = 500;

// ─── Normalização ────────────────────────────────────────────────────────────
function normalizeMunicipio(raw: string): string {
  return String(raw)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeColName(raw: string): string {
  return String(raw)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '')
    .replace(/__+/g, '_') || 'col_vazia';
}

function disambiguateCols(names: string[]): string[] {
  const seen: Record<string, number> = {};
  return names.map(n => {
    if (seen[n] === undefined) { seen[n] = 0; return n; }
    seen[n]++;
    return `${n}_${seen[n]}`;
  });
}

function isNumericCol(vals: any[]): boolean {
  const nonEmpty = vals.filter(v => v !== '' && v != null);
  if (nonEmpty.length === 0) return false;
  return nonEmpty.every(v => !isNaN(Number(String(v).replace(',', '.'))));
}

// ─── Leitura do Excel de referência (DRS / RRAS) ─────────────────────────────
interface RefRow { municipio: string; valor: string }

function readRefXlsx(filePath: string, colMunicipio: number, colValor: number): RefRow[] {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const rows: RefRow[] = [];
  for (let i = 1; i < raw.length; i++) {
    const mun = String(raw[i][colMunicipio] ?? '').trim();
    const val = String(raw[i][colValor]     ?? '').trim();
    if (!mun || !val) continue;
    rows.push({ municipio: normalizeMunicipio(mun), valor: val });
  }
  return rows;
}

// ─── Upsert tabela de referência ─────────────────────────────────────────────
async function upsertRefTable(
  supabase: SupabaseClient,
  tableName: string,
  valorColumn: string,
  rows: RefRow[],
): Promise<void> {
  const deduped = new Map<string, string>();
  for (const r of rows) deduped.set(r.municipio, r.valor);
  const upsertRows = [...deduped.entries()].map(([municipio, valor]) => ({
    municipio,
    [valorColumn]: valor,
  }));

  process.stdout.write(`   Upserting ${upsertRows.length} registros em ${tableName}...`);
  for (let i = 0; i < upsertRows.length; i += CHUNK_SIZE) {
    const chunk = upsertRows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase
      .from(tableName)
      .upsert(chunk, { onConflict: 'municipio' });
    if (error) throw new Error(`${tableName} chunk ${i}: ${error.message}`);
  }
  process.stdout.write(` ✔\n`);
}

// ─── Leitura do Excel LC131 ───────────────────────────────────────────────────
function readLcXlsx(filePath: string): { headers: string[]; rows: Record<string, any>[] } {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawMatrix: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rawMatrix.length < 2) throw new Error('Arquivo sem dados suficientes.');

  // Detecta a linha de cabeçalho: primeira linha com >= 3 células de texto
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(10, rawMatrix.length); i++) {
    const row = rawMatrix[i];
    const nonEmpty = row.filter((v: any) => v !== '' && v != null);
    const textCells = nonEmpty.filter((v: any) => typeof v === 'string' && isNaN(Number(v)));
    if (nonEmpty.length >= 3 && textCells.length / nonEmpty.length > 0.6) {
      headerRowIdx = i;
      break;
    }
  }
  console.log(`   → Cabeçalho detectado na linha ${headerRowIdx + 1}`);

  const rawHeaders: string[] = rawMatrix[headerRowIdx].map(String);
  const normalizedHeaders = disambiguateCols(rawHeaders.map(normalizeColName));

  const dataStart = headerRowIdx + 1;
  const numericCols = new Set(
    normalizedHeaders.filter(h => {
      const idx = normalizedHeaders.indexOf(h);
      const vals = rawMatrix.slice(dataStart, dataStart + 50).map(r => r[idx]);
      return isNumericCol(vals);
    }),
  );

  // Linhas de resumo a ignorar (ex: "Total Geral")
  const SKIP_PREFIXES = ['total geral', 'total', 'subtotal'];

  const rows: Record<string, any>[] = [];
  for (let i = dataStart; i < rawMatrix.length; i++) {
    const rowArray = rawMatrix[i];
    if (rowArray.every((v: any) => v === '' || v == null)) continue;
    // Pula linhas de resumo
    const firstCell = String(rowArray[0] ?? '').toLowerCase().trim();
    if (SKIP_PREFIXES.some(p => firstCell.startsWith(p))) continue;

    const row: Record<string, any> = {};
    normalizedHeaders.forEach((col, j) => {
      const v = rowArray[j] ?? '';
      if (numericCols.has(col)) {
        row[col] = v === '' || v == null ? null : (isNaN(Number(String(v).replace(',', '.'))) ? null : Number(String(v).replace(',', '.')));
      } else {
        row[col] = v === '' ? null : v;
      }
    });
    rows.push(row);
  }
  return { headers: normalizedHeaders, rows };
}

// ─── Fingerprint para deduplicação incremental ────────────────────────────────
function computeFingerprint(row: Record<string, any>, cols: string[]): string {
  const str = cols.map(c => String(row[c] ?? '')).join('\x00');
  return createHash('md5').update(str).digest('hex');
}

/** Valida quais colunas existem na tabela e retorna somente as válidas */
async function validateColumns(
  supabase: SupabaseClient,
  tableName: string,
  columns: string[],
): Promise<string[]> {
  let validCols = [...columns];
  // Tenta uma query com limit 0 para validar colunas
  while (validCols.length > 0) {
    const { error } = await supabase
      .from(tableName)
      .select(validCols.join(','))
      .limit(1);
    if (!error) return validCols;
    // Remove a coluna problemática
    const match = error.message.match(/column\s+\w+\.(\w+)\s+does not exist/);
    if (match) {
      console.log(`   ⚠️  Coluna "${match[1]}" não existe na tabela — ignorando.`);
      validCols = validCols.filter(c => c !== match[1]);
      continue;
    }
    throw new Error(`Erro de validação: ${error.message}`);
  }
  return validCols;
}

async function fetchExistingFingerprints(
  supabase: SupabaseClient,
  year: number,
  columns: string[],
): Promise<{ fps: Set<string>; fpCols: string[] }> {
  const seen = new Set<string>();
  // Usa subconjunto menor para fetch rápido — suficiente para identificar registros únicos
  const FP_KEY_COLS = [
    'codigo_ug', 'codigo_projeto_atividade', 'codigo_elemento',
    'codigo_favorecido', 'empenhado', 'liquidado', 'pago', 'pago_anos_anteriores',
  ];
  const selectCols = FP_KEY_COLS.filter(c => columns.includes(c));
  if (selectCols.length === 0) {
    console.warn(`   ⚠️  Sem colunas-chave para fingerprint.`);
    return { fps: seen, fpCols: selectCols };
  }
  const selectStr = selectCols.join(',');
  const PAGE = 5000;
  let offset = 0;

  process.stdout.write(`   Buscando registros existentes de ${year} (${selectCols.length} cols-chave)...`);

  while (true) {
    const { data, error } = await supabase
      .from('lc131_despesas')
      .select(selectStr)
      .eq('ano_referencia', year)
      .range(offset, offset + PAGE - 1);

    if (error) throw new Error(`Erro ao buscar existentes: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) {
      seen.add(computeFingerprint(row, selectCols));
    }
    offset += data.length;
    process.stdout.write(` ${offset.toLocaleString('pt-BR')}...`);
    if (data.length < PAGE) break;
  }

  process.stdout.write(` ${seen.size.toLocaleString('pt-BR')} únicos.\n`);
  return { fps: seen, fpCols: selectCols };
}

// ─── Insert LC131 ─────────────────────────────────────────────────────────────
async function insertLcData(
  supabase: SupabaseClient,
  tableName: string,
  rows: Record<string, any>[],
  label: string,
): Promise<void> {
  let uploaded = 0;
  process.stdout.write(`\n   Enviando ${rows.length.toLocaleString('pt-BR')} registros de ${label}...\n`);
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from(tableName).insert(chunk);
    if (error) throw new Error(`${label} chunk ${i}: ${error.message}\n${error.details ?? ''}`);
    uploaded += chunk.length;
    const pct = Math.round((uploaded / rows.length) * 100);
    process.stdout.write(`\r   ${pct.toString().padStart(3)}% — ${uploaded.toLocaleString('pt-BR')} / ${rows.length.toLocaleString('pt-BR')}`);
  }
  process.stdout.write(` ✔\n`);
}

// ─── Parse CLI args ───────────────────────────────────────────────────────────
function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : undefined;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  const noTruncate    = args.includes('--no-truncate');
  const replaceMode   = args.includes('--replace');   // deleta por ano antes de inserir
  const incremental   = args.includes('--incremental'); // só insere registros novos
  const skipDrsRras   = args.includes('--skip-drs-rras');
  const skipLc        = args.includes('--skip-lc');

  const drsPath  = getArg(args, '--drs');
  const rrasPath = getArg(args, '--rras');
  const lcPaths  = ['--lc2022','--lc2023','--lc2024','--lc2025','--lc2026']
    .map(f => getArg(args, f))
    .filter(Boolean) as string[];

  console.log('\n════════════════════════════════════════════════════════');
  console.log('  IMPORTAÇÃO COMPLETA → Supabase');
  console.log('════════════════════════════════════════════════════════');
  if (!skipDrsRras) {
    console.log(`  DRS   : ${drsPath  ? path.basename(drsPath)  : '(não informado)'}`);
    console.log(`  RRAS  : ${rrasPath ? path.basename(rrasPath) : '(não informado)'}`);
  }
  if (!skipLc) {
    lcPaths.forEach(p => console.log(`  LC    : ${path.basename(p)}`));
    const modoLabel = incremental ? 'incremental (só novos)'
      : noTruncate ? 'append (sem truncate)'
      : replaceMode ? 'replace por ano'
      : 'truncate + re-import';
    console.log(`  Modo  : ${modoLabel}`);
  }
  console.log('════════════════════════════════════════════════════════\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // ── 1. DRS e RRAS ──────────────────────────────────────────────────────────
  if (!skipDrsRras) {
    if (!drsPath || !rrasPath) {
      console.error('❌  Forneça --drs e --rras, ou use --skip-drs-rras para pular.');
      process.exit(1);
    }
    for (const p of [drsPath, rrasPath]) {
      if (!fs.existsSync(p)) { console.error(`❌  Não encontrado: ${p}`); process.exit(1); }
    }

    console.log('📋 [1/3] Importando tabelas de referência DRS e RRAS...');

    const drsRows = readRefXlsx(drsPath, 1, 0);   // col 1=Municipio, col 0=DRS
    await upsertRefTable(supabase, 'tab_drs', 'drs', drsRows);

    const rrasRows = readRefXlsx(rrasPath, 1, 0); // col 1=Municipio, col 0=RRAS
    await upsertRefTable(supabase, 'tab_rras', 'rras', rrasRows);
    console.log('   ✅ DRS e RRAS importados.\n');
  } else {
    console.log('⏭️  [1/3] Pulando DRS/RRAS (--skip-drs-rras).\n');
  }

  // ── 2. Truncate lc131_despesas ─────────────────────────────────────────────
  // --replace / --incremental: pula truncate global
  if (!skipLc && !noTruncate && !replaceMode && !incremental && lcPaths.length > 0) {
    console.log('📋 [2/3] Limpando tabela lc131_despesas...');
    const { error } = await supabase
      .from('lc131_despesas')
      .delete()
      .not('id', 'is', null);
    if (error) console.warn(`   ⚠️  Aviso ao limpar: ${error.message}`);
    else console.log('   ✔ Tabela limpa.\n');
  } else if (!skipLc) {
    const modoMsg = incremental ? 'incremental (--incremental)'
      : noTruncate ? 'append (--no-truncate)'
      : replaceMode ? 'replace por ano (--replace)' : '';
    console.log(`⏭️  [2/3] ${modoMsg} — sem truncate global.\n`);
  }

  // ── 3. Importar arquivos LC131 ─────────────────────────────────────────────
  let totalNewRows = 0;
  if (!skipLc) {
    if (lcPaths.length === 0) {
      console.log('ℹ️  [3/3] Nenhum arquivo LC --lc20XX fornecido. Pulando.\n');
    } else {
      console.log(`📋 [3/3] Importando ${lcPaths.length} arquivo(s) LC 131...`);
      for (const lcPath of lcPaths) {
        if (!fs.existsSync(lcPath)) {
          console.warn(`   ⚠️  Não encontrado (pulando): ${lcPath}`);
          continue;
        }
        console.log(`\n📂 Lendo ${path.basename(lcPath)}...`);
        const { headers, rows } = readLcXlsx(lcPath);
        console.log(`   → ${rows.length.toLocaleString('pt-BR')} linhas, ${headers.length} colunas`);
        console.log(`   Colunas: ${headers.join(', ')}`);

        // ── Modo incremental: só insere registros novos ──────────────────
        if (incremental) {
          // Detecta o ano a partir dos dados ou do nome do arquivo
          let year: number | null = null;
          if (rows.length > 0 && rows[0].ano_referencia != null) {
            year = Number(rows[0].ano_referencia);
          }
          if (!year || isNaN(year)) {
            const m = path.basename(lcPath).match(/\d{4}/);
            year = m ? parseInt(m[0]) : null;
          }
          if (!year) {
            console.warn(`   ⚠️  Não foi possível detectar o ano. Importando tudo (append).`);
            await insertLcData(supabase, 'lc131_despesas', rows, path.basename(lcPath));
            totalNewRows += rows.length;
            continue;
          }

          console.log(`   🔍 Modo incremental — verificando registros existentes para ${year}...`);

          // Valida quais colunas do Excel existem na tabela do DB
          const dbCols = await validateColumns(supabase, 'lc131_despesas', headers);

          const existingFps = await fetchExistingFingerprints(supabase, year, dbCols);

          const newRows = rows.filter(r => !existingFps.fps.has(computeFingerprint(r, existingFps.fpCols)));
          const skipped = rows.length - newRows.length;

          console.log(`   → ${newRows.length.toLocaleString('pt-BR')} novos | ${skipped.toLocaleString('pt-BR')} já existentes`);

          if (newRows.length === 0) {
            console.log(`   ✅ Nenhum registro novo. Tudo já importado.`);
            continue;
          }

          // Remove colunas que não existem na tabela antes de inserir
          const colsToRemove = headers.filter(h => !dbCols.includes(h));
          let insertRows = newRows;
          if (colsToRemove.length > 0) {
            console.log(`   ⚠️  Removendo colunas inexistentes: ${colsToRemove.join(', ')}`);
            insertRows = newRows.map(r => {
              const clean = { ...r };
              for (const c of colsToRemove) delete clean[c];
              return clean;
            });
          }

          await insertLcData(supabase, 'lc131_despesas', insertRows, path.basename(lcPath));
          totalNewRows += newRows.length;
          continue;
        }

        // Em modo --replace, deleta o ano correspondente antes de inserir
        if (replaceMode) {
          const yearMatch = path.basename(lcPath).match(/\d{4}/);
          if (yearMatch) {
            const year = parseInt(yearMatch[0]);
            process.stdout.write(`   🗑️  Deletando dados existentes para ano ${year}...`);
            const { error: delErr } = await supabase
              .from('lc131_despesas')
              .delete()
              .eq('ano_referencia', year);
            if (delErr) console.warn(`\n   ⚠️  Aviso ao deletar ano ${year}: ${delErr.message}`);
            else process.stdout.write(` ✔\n`);
          }
        }

        await insertLcData(supabase, 'lc131_despesas', rows, path.basename(lcPath));
        totalNewRows += rows.length;
      }
      console.log('\n   ✅ Todos os arquivos LC 131 importados.\n');
    }
  } else {
    console.log('⏭️  [3/3] Pulando importação LC 131 (--skip-lc).\n');
  }

  // ── 4. Enriquecer novos registros (refresh_dashboard) ──────────────────────
  if (totalNewRows > 0) {
    console.log('📋 [4/4] Enriquecendo registros (DRS, RRAS, município)...');
    const { error: rpcErr } = await supabase.rpc('refresh_dashboard');
    if (rpcErr) console.warn(`   ⚠️  Aviso ao enriquecer: ${rpcErr.message}`);
    else console.log('   ✔ Registros enriquecidos com sucesso.\n');
  }

  console.log('════════════════════════════════════════════════════════');
  console.log('  ✅ Importação completa concluída!');
  console.log('════════════════════════════════════════════════════════\n');
  console.log('Execute as queries de validação da PARTE 4 do supabase_setup.sql.\n');
}

main().catch(err => {
  console.error('\n❌  Erro fatal:', err.message ?? err);
  process.exit(1);
});
