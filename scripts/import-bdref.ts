/**
 * import-bdref.ts
 * -----------------------------------------------------------------------
 * Importa o arquivo Excel de referência para a tabela bd_ref no Supabase.
 *
 * USO:
 *   npx tsx scripts/import-bdref.ts "C:\Downloads\DESPESAS - 2022...xlsx"
 *
 * O QUE FAZ:
 *   1. Lê o Excel e detecta automaticamente as colunas relevantes
 *   2. Preserva o valor exato de DRS do Excel (sem normalização)
 *   3. Faz UPSERT em bd_ref via codigo (ON CONFLICT DO UPDATE)
 *   4. Imprime resumo com total inserido e cobertura de DRS
 *
 * COLUNAS ESPERADAS NO EXCEL (nomes aproximados, detectados automaticamente):
 *   - Código / Código Projeto Atividade / Código UG  → campo "codigo"
 *   - Unidade / Nome / Órgão                         → campo "unidade"
 *   - DRS / DRS Responsável                          → campo "drs"
 *   - Região Administrativa / Região Adm.            → campo "regiao_ad"
 *   - RRAS                                           → campo "rras"
 *   - Região de Saúde / Região Saúde                 → campo "regiao_sa"
 *   - Cód IBGE / Código IBGE                         → campo "cod_ibge"
 *   - Município / Municipio                          → campo "municipio"
 *   - Fonte de Recursos / Fonte Recurso              → campo "fonte_recurso"
 *   - Grupo de Despesa / Grupo Despesa               → campo "grupo_despesa"
 *   - Tipo de Despesa / Tipo Despesa                 → campo "tipo_despesa"
 *   - Rótulo / Rotulo                                → campo "rotulo"
 * -----------------------------------------------------------------------
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx') as typeof import('xlsx');

// ─── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://odnstbeuiojohutoqvvw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kbnN0YmV1aW9qb2h1dG9xdnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTQ1NzgsImV4cCI6MjA5MDA5MDU3OH0._71Nt-rjs3EvOuDcGcQcPFKug-iDg_dEs38UVLBLJEQ';
const CHUNK_SIZE   = 500;
const TARGET_TABLE = 'bd_ref';

// ─── DRS normalization map ────────────────────────────────────────────────────
// Preserva o valor exato do Excel. Retorna string vazia se ausente.
function normalizeDrs(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.trim();
}

// ─── Column name matching ─────────────────────────────────────────────────────
// Tries to find the best column match for each logical field.
// Returns the first matching header found (case-insensitive, accent-insensitive).

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const FIELD_PATTERNS: Record<string, RegExp[]> = {
  codigo: [
    /^c[oó]d(igo)?\s*(projeto\s*atividade|ug|unidade)?\s*$/i,
    /^c[oó]d(igo)?$/i,
    /c[oó]digo\s*projeto\s*atividade/i,
    /c[oó]digo\s*ug/i,
    /^codigo$/i,
  ],
  unidade: [
    /^unidade$/i,
    /nome\s*unidade/i,
    /^nome\s*(ug|uo|[oó]rg[aã]o)?$/i,
    /descri[cç]ao\s*(unidade|ug|uo)/i,
  ],
  drs: [
    /^drs\s*(respons[aá]vel)?$/i,
    /^drs$/i,
    /drs\s*respons/i,
  ],
  regiao_ad: [
    /regi[aã]o\s*adm(inistrativa)?/i,
    /regi[aã]o\s*adm/i,
  ],
  rras: [
    /^rras$/i,
    /rras/i,
  ],
  regiao_sa: [
    /regi[aã]o\s*de\s*sa[uú]de/i,
    /regi[aã]o\s*sa[uú]de/i,
  ],
  cod_ibge: [
    /c[oó]d(igo)?\s*ibge/i,
    /ibge/i,
  ],
  municipio: [
    /^munic[ií]pio$/i,
    /municipio/i,
    /munic[ií]pio/i,
  ],
  fonte_recurso: [
    /fonte\s*de\s*recursos/i,
    /fonte\s*recurso/i,
    /^fonte$/i,
  ],
  grupo_despesa: [
    /grupo\s*de\s*despesa/i,
    /grupo\s*despesa/i,
    /^grupo$/i,
  ],
  tipo_despesa: [
    /tipo\s*de\s*despesa/i,
    /tipo\s*despesa/i,
    /^tipo$/i,
  ],
  rotulo: [
    /r[oó]tulo/i,
    /^rotulo$/i,
  ],
};

function findColumn(headers: string[], field: string): string | null {
  const patterns = FIELD_PATTERNS[field] ?? [];
  for (const pat of patterns) {
    const found = headers.find(h => pat.test(h) || pat.test(norm(h)));
    if (found) return found;
  }
  return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('❌  Informe o caminho do arquivo Excel:');
    console.error('    npx tsx scripts/import-bdref.ts "C:\\...\\DESPESAS.xlsx"');
    process.exit(1);
  }
  if (!fs.existsSync(filePath)) {
    console.error(`❌  Arquivo não encontrado: ${filePath}`);
    process.exit(1);
  }

  console.log(`\n📂  Lendo: ${path.basename(filePath)}`);
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const matrix: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  if (matrix.length < 2) { console.error('❌  Arquivo sem dados.'); process.exit(1); }

  // Detect header row (first row where >60% cells are non-numeric text)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(6, matrix.length); i++) {
    const row = matrix[i];
    const nonEmpty = row.filter(v => v !== '' && v != null);
    const textCells = nonEmpty.filter(v => typeof v === 'string' && isNaN(Number(v)));
    if (nonEmpty.length >= 2 && textCells.length / nonEmpty.length > 0.5) {
      headerIdx = i; break;
    }
  }

  const rawHeaders: string[] = matrix[headerIdx].map(String);
  console.log(`   → Cabeçalho na linha ${headerIdx + 1}: ${rawHeaders.slice(0, 6).join(' | ')} ...`);

  // Map fields to actual column headers
  const colMap: Record<string, string | null> = {};
  for (const field of Object.keys(FIELD_PATTERNS)) {
    colMap[field] = findColumn(rawHeaders, field);
  }

  console.log('\n🗺️   Mapeamento de colunas:');
  for (const [field, col] of Object.entries(colMap)) {
    console.log(`   ${field.padEnd(14)} → ${col ?? '(não encontrado)'}`);
  }

  if (!colMap.codigo) {
    console.error('\n❌  Coluna "codigo" não encontrada. Verifique se o Excel tem uma coluna "Código" ou "Código Projeto Atividade".');
    console.error('   Colunas disponíveis:', rawHeaders.join(', '));
    process.exit(1);
  }

  // Build rows
  const rows: Record<string, any>[] = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const raw = matrix[i];
    if (raw.every((v: any) => v === '' || v == null)) continue;

    const get = (field: string): string => {
      const col = colMap[field];
      if (!col) return '';
      const idx = rawHeaders.indexOf(col);
      return idx >= 0 ? String(raw[idx] ?? '').trim() : '';
    };

    const codigo = get('codigo').replace(/[^0-9A-Za-z]/g, '').slice(0, 10);
    if (!codigo) continue; // skip rows without a valid code

    const drsRaw = get('drs');
    const drs = normalizeDrs(drsRaw);

    rows.push({
      codigo,
      unidade:       get('unidade')      || null,
      drs:           drs                 || null,
      regiao_ad:     get('regiao_ad')    || null,
      rras:          get('rras')         || null,
      regiao_sa:     get('regiao_sa')    || null,
      cod_ibge:      get('cod_ibge')     || null,
      municipio:     get('municipio')    || null,
      fonte_recurso: get('fonte_recurso')|| null,
      grupo_despesa: get('grupo_despesa')|| null,
      tipo_despesa:  get('tipo_despesa') || null,
      rotulo:        get('rotulo')       || null,
    });
  }

  console.log(`\n📊  ${rows.length} registros lidos do Excel`);
  const comDrs = rows.filter(r => r.drs).length;
  const comMun = rows.filter(r => r.municipio).length;
  console.log(`   → Com DRS:      ${comDrs} (${Math.round(comDrs / rows.length * 100)}%)`);
  console.log(`   → Com Município: ${comMun} (${Math.round(comMun / rows.length * 100)}%)`);

  if (rows.length === 0) {
    console.error('❌  Nenhum registro válido encontrado.');
    process.exit(1);
  }

  // Confirm
  process.stdout.write(`\n❓  Fazer UPSERT de ${rows.length} registros em "${TARGET_TABLE}"? (s/N) `);
  const answer = await new Promise<string>(res => {
    process.stdin.resume();
    process.stdin.once('data', d => { process.stdin.pause(); res(d.toString().trim()); });
  });
  if (!/^s(im)?$/i.test(answer)) {
    console.log('⛔  Cancelado.');
    process.exit(0);
  }

  // Upload in chunks
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  let upserted = 0;
  let errors = 0;

  console.log(`\n⬆️   Enviando para Supabase em chunks de ${CHUNK_SIZE}...`);
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase
      .from(TARGET_TABLE)
      .upsert(chunk, { onConflict: 'codigo', ignoreDuplicates: false });

    if (error) {
      console.error(`   ❌  Chunk ${i}–${i + chunk.length}: ${error.message}`);
      errors++;
    } else {
      upserted += chunk.length;
      process.stdout.write(`   ✅  ${upserted}/${rows.length}\r`);
    }
  }

  console.log(`\n\n🎉  Concluído! ${upserted} registros em "${TARGET_TABLE}" (${errors} chunk(s) com erro)`);
  if (errors === 0) {
    console.log('   → Execute o SQL de validação (PARTE 4 do supabase_setup.sql) para verificar a cobertura de DRS.');
  }
}

main().catch(e => { console.error('Erro fatal:', e); process.exit(1); });
