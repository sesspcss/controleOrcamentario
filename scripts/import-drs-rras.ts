/**
 * import-drs-rras.ts
 * -----------------------------------------------------------------------
 * Importa os arquivos de referência DRS.xlsx e RRAS.xlsx para o Supabase,
 * populando as tabelas tab_drs e tab_rras.
 *
 * USO:
 *   npx tsx scripts/import-drs-rras.ts <DRS.xlsx> <RRAS.xlsx>
 *
 * EXEMPLO:
 *   npx tsx scripts/import-drs-rras.ts "C:/Downloads/LC31/DRS.xlsx" "C:/Downloads/LC31/RRAS.xlsx"
 *
 * PRÉ-REQUISITO:
 *   Execute a PARTE 0c e 0d do supabase_setup.sql antes (cria as tabelas).
 *
 * NORMALIZAÇÃO DA CHAVE:
 *   O campo "municipio" é armazenado em MAIÚSCULAS sem acentos, pois é assim
 *   que o campo nome_municipio vem na planilha LC 131.
 *   Ex: "Aguaí" → "AGUAI", "São Paulo" → "SAO PAULO"
 * -----------------------------------------------------------------------
 */

import { createClient } from '@supabase/supabase-js';
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

// ─── Normalização da chave municipio ─────────────────────────────────────────
/**
 * Converte o nome do município para a forma canônica usada como chave:
 * letras maiúsculas, sem acentos, sem espaços extras.
 * Isso deve bater com o campo nome_municipio na planilha LC 131.
 */
function normalizeMunicipio(raw: string): string {
  return String(raw)
    .normalize('NFD')               // decompõe caracteres acentuados
    .replace(/[\u0300-\u036f]/g, '') // remove diacríticos (acentos, cedilha, etc.)
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');           // colapsa múltiplos espaços
}

// ─── Leitura do Excel ─────────────────────────────────────────────────────────
interface RefRow { municipio: string; valor: string }

function readRefXlsx(filePath: string, colMunicipio: number, colValor: number): RefRow[] {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const rows: RefRow[] = [];
  for (let i = 1; i < raw.length; i++) {     // pula linha de cabeçalho (i=0)
    const municipioRaw = String(raw[i][colMunicipio] ?? '').trim();
    const valorRaw     = String(raw[i][colValor]     ?? '').trim();
    if (!municipioRaw || !valorRaw) continue; // ignora linhas vazias
    rows.push({
      municipio: normalizeMunicipio(municipioRaw),
      valor:     valorRaw,
    });
  }
  return rows;
}

// ─── Upsert no Supabase ───────────────────────────────────────────────────────
async function upsertTable(
  tableName: string,
  valorColumn: string,
  rows: RefRow[],
): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Deduplica: último valor vence quando há município duplicado no Excel
  const deduped = new Map<string, string>();
  for (const r of rows) deduped.set(r.municipio, r.valor);
  const upsertRows = [...deduped.entries()].map(([municipio, valor]) => ({
    municipio,
    [valorColumn]: valor,
  }));

  console.log(`\n📤 Upsert em "${tableName}": ${upsertRows.length} municípios...`);

  let done = 0;
  for (let i = 0; i < upsertRows.length; i += CHUNK_SIZE) {
    const chunk = upsertRows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase
      .from(tableName)
      .upsert(chunk, { onConflict: 'municipio' });

    if (error) {
      throw new Error(
        `Erro no chunk ${i}–${i + chunk.length} de "${tableName}": ${error.message}\n` +
        `Detalhe: ${error.details ?? ''}\n` +
        `Dica: verifique se a tabela foi criada com o SQL da PARTE 0c/0d.`,
      );
    }
    done += chunk.length;
    process.stdout.write(`\r   ${done}/${upsertRows.length} registros`);
  }
  process.stdout.write('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'));

  if (args.length < 2) {
    console.error(
      '\n❌  Uso: npx tsx scripts/import-drs-rras.ts <DRS.xlsx> <RRAS.xlsx>\n',
    );
    process.exit(1);
  }

  const drsPath  = path.resolve(args[0]);
  const rrasPath = path.resolve(args[1]);

  for (const p of [drsPath, rrasPath]) {
    if (!fs.existsSync(p)) {
      console.error(`\n❌  Arquivo não encontrado: ${p}\n`);
      process.exit(1);
    }
  }

  console.log('\n════════════════════════════════════════════════════════');
  console.log('  IMPORTADOR DRS + RRAS → Supabase');
  console.log('════════════════════════════════════════════════════════');
  console.log(`  DRS   : ${path.basename(drsPath)}`);
  console.log(`  RRAS  : ${path.basename(rrasPath)}`);
  console.log(`  URL   : ${SUPABASE_URL}`);
  console.log('════════════════════════════════════════════════════════\n');

  // ── DRS.xlsx: colunas [0]=DRS, [1]=Municipio ──────────────────────────────
  // Nota: estrutura esperada: coluna A = DRS, coluna B = Municipio
  console.log(`📂 Lendo ${path.basename(drsPath)}...`);
  const drsRows = readRefXlsx(drsPath, /* municipio col */ 1, /* drs col */ 0);
  console.log(`   → ${drsRows.length} linhas lidas`);

  await upsertTable('tab_drs', 'drs', drsRows);
  console.log(`   ✔ tab_drs atualizada com ${drsRows.length} municípios.`);

  // ── RRAS.xlsx: colunas [0]=RRAS, [1]=Municipio ────────────────────────────
  console.log(`\n📂 Lendo ${path.basename(rrasPath)}...`);
  const rrasRows = readRefXlsx(rrasPath, /* municipio col */ 1, /* rras col */ 0);
  console.log(`   → ${rrasRows.length} linhas lidas`);

  await upsertTable('tab_rras', 'rras', rrasRows);
  console.log(`   ✔ tab_rras atualizada com ${rrasRows.length} municípios.`);

  console.log('\n✅ Importação de DRS e RRAS concluída!\n');
  console.log('Próximo passo: importe os arquivos LC 131 com import-all.ts ou import-lc131.ts.\n');
}

main().catch(err => {
  console.error('\n❌  Erro fatal:', err.message ?? err);
  process.exit(1);
});
