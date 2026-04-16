/**
 * import-lc131.ts
 * -----------------------------------------------------------------------
 * Script para importar a planilha LC 131 no Supabase.
 *
 * USO:
 *   npx tsx scripts/import-lc131.ts <caminho-do-arquivo.xlsx> [--tabela nome_tabela]
 *
 * EXEMPLOS:
 *   npx tsx scripts/import-lc131.ts "C:/Downloads/LC_131_2024.xlsx"
 *   npx tsx scripts/import-lc131.ts "C:/Downloads/LC_131_2024.xlsx" --tabela lc131_2024
 *
 * O QUE O SCRIPT FAZ:
 *   1. Lê o arquivo XLSX detectando automaticamente a linha de cabeçalho
 *   2. Normaliza os nomes das colunas (minúsculas, sem acentos, espaços → _)
 *   3. Gera o SQL CREATE TABLE pronto para colar no Supabase SQL Editor
 *   4. Pergunta se a tabela já foi criada e faz o upload dos dados
 * -----------------------------------------------------------------------
 */

import { createClient } from '@supabase/supabase-js';
import { spawn } from 'child_process';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import * as path from 'path';
import * as readline from 'readline';
import { createRequire } from 'module';

// Bypass SSL interception by corporate proxies (local admin script only)
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

// CJS interop for xlsx (CommonJS package)
const require = createRequire(import.meta.url);
const XLSX = require('xlsx') as typeof import('xlsx');

// Diretório deste script (para localizar post-import.mjs)
const __importDir = path.dirname(fileURLToPath(import.meta.url));

// ─── Configuração Supabase ───────────────────────────────────────────────────
const SUPABASE_URL  = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODkwNDQsImV4cCI6MjA5MTM2NTA0NH0.t3tWIh3F9lmg-a6zzdmoKpupHB9i7hTfvFmPyFbZNZs';
const CHUNK_SIZE    = 500;

// ─── Utilitários ─────────────────────────────────────────────────────────────

function normalizeColName(raw: string): string {
  return String(raw)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // remove acentos
    .toLowerCase()
    .replace(/\s+/g, '_')              // espaços → _
    .replace(/[^a-z0-9_]/g, '')        // remove caracteres especiais
    .replace(/^_+|_+$/g, '')           // remove _ nas bordas
    .replace(/__+/g, '_')              // colapsa __ em _
    || 'col_vazia';
}

/** Garante nomes únicos adicionando sufixo numérico quando há colisão */
function disambiguateCols(names: string[]): string[] {
  const seen: Record<string, number> = {};
  return names.map(n => {
    if (seen[n] === undefined) { seen[n] = 0; return n; }
    seen[n]++;
    return `${n}_${seen[n]}`;
  });
}

/** Detecta se um conjunto de valores parece numérico */
function isNumericCol(vals: any[]): boolean {
  const nonEmpty = vals.filter(v => v !== '' && v != null);
  if (nonEmpty.length === 0) return false;
  return nonEmpty.every(v => !isNaN(Number(String(v).replace(',', '.'))));
}

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

// ─── Leitura do arquivo ───────────────────────────────────────────────────────

function readXlsx(filePath: string): { headers: string[]; rows: Record<string, any>[] } {
  console.log(`\n📂 Lendo arquivo: ${path.basename(filePath)}`);
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];

  // Lê como array bruto para detectar a linha de cabeçalho
  const rawMatrix: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  if (rawMatrix.length < 2) throw new Error('Arquivo sem dados suficientes.');

  // Detecta a linha de cabeçalho: primeira linha onde a maioria das células
  // não é número e não está vazia
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(5, rawMatrix.length); i++) {
    const row = rawMatrix[i];
    const nonEmpty = row.filter(v => v !== '' && v != null);
    const textCells = nonEmpty.filter(v => typeof v === 'string' && isNaN(Number(v)));
    if (nonEmpty.length >= 3 && textCells.length / nonEmpty.length > 0.6) {
      headerRowIdx = i;
      break;
    }
  }

  console.log(`   → Cabeçalho detectado na linha ${headerRowIdx + 1}`);

  const rawHeaders: string[] = rawMatrix[headerRowIdx].map(String);
  const normalizedHeaders = disambiguateCols(rawHeaders.map(normalizeColName)).map(applyColAlias);

  // Monta as linhas de dados (a partir da linha seguinte ao cabeçalho)
  const rows: Record<string, any>[] = [];
  for (let i = headerRowIdx + 1; i < rawMatrix.length; i++) {
    const rowArray = rawMatrix[i];
    // Ignora linhas totalmente vazias
    if (rowArray.every(v => v === '' || v == null)) continue;

    const row: Record<string, any> = {};
    normalizedHeaders.forEach((col, j) => {
      row[col] = rowArray[j] ?? '';
    });
    rows.push(row);
  }

  return { headers: normalizedHeaders, rows };
}

// ─── Mapeamento de colunas: variações de nome de cabeçalho → nome canônico do DB ───
// Garante que mudanças no nome da coluna no XLSX não quebram o upload.
const COL_ALIAS: Record<string, string> = {
  // pagamento / valores
  'pago_total':                   'pago',
  'pagamento':                    'pago',
  'vl_pago':                      'pago',
  'valor_pago':                   'pago',
  'pago_exercicio':               'pago',
  'pago_anos_anteriores':         'pago_anos_anteriores',
  'pago_ano_anterior':            'pago_anos_anteriores',
  'vl_empenhado':                 'empenhado',
  'valor_empenhado':              'empenhado',
  'vl_liquidado':                 'liquidado',
  'valor_liquidado':              'liquidado',
  // identificadores
  'ano':                          'ano_referencia',
  'ano_ref':                      'ano_referencia',
  'exercicio':                    'ano_referencia',
  'cod_ibge':                     'cod_ibge',
  'codigo_ibge':                  'cod_ibge',
  'ibge':                         'cod_ibge',
  // geograficos
  'nome_municipio':               'municipio',
  'municipio_nome':               'municipio',
  // organizacionais
  'codigo_nome_unidade_orcamentaria': 'codigo_nome_uo',
  'unidade_orcamentaria':         'codigo_nome_uo',
  'codigo_nome_unidade_gestora':  'codigo_nome_ug',
  'unidade_gestora':              'codigo_nome_ug',
  'codigo_unidade_gestora':       'codigo_ug',
  // despesa
  'codigo_nome_grupo_de_despesas': 'codigo_nome_grupo',
  'grupo_de_despesas':            'codigo_nome_grupo',
  'codigo_nome_elemento_de_despesa': 'codigo_nome_elemento',
  'elemento_de_despesa':          'codigo_nome_elemento',
  'codigo_nome_fonte_de_recursos': 'codigo_nome_fonte_recurso',
  'fonte_de_recursos':            'codigo_nome_fonte_recurso',
  'descricao':                    'descricao_processo',
  'processo':                     'descricao_processo',
};

/** Aplica alias de coluna: se o nome normalizado está no mapa, retorna o nome canônico */
function applyColAlias(normalizedName: string): string {
  return COL_ALIAS[normalizedName] ?? normalizedName;
}

// Colunas de pagamento obrigatórias — se todas forem NULL o import falhou
const PAYMENT_COLS = ['pago', 'empenhado', 'liquidado'];

/** Valida que pelo menos uma coluna de pagamento tem dados reais */
function validatePaymentCols(rows: Record<string, any>[]): void {
  if (rows.length === 0) return;
  const sample = rows.slice(0, Math.min(100, rows.length));
  const colsPresent = Object.keys(sample[0]);
  const missing = PAYMENT_COLS.filter(c => !colsPresent.includes(c));
  if (missing.length > 0) {
    console.warn(`\n⚠️  ATENÇÃO: colunas de pagamento não encontradas: ${missing.join(', ')}`);
    console.warn('   Verifique os nomes das colunas no XLSX. O upload continuará, mas os valores podem ficar NULL.\n');
  }
  const nullPct = PAYMENT_COLS.filter(c => colsPresent.includes(c)).map(c => {
    const nullCount = sample.filter(r => r[c] == null).length;
    return { col: c, pct: Math.round(nullCount / sample.length * 100) };
  });
  const critical = nullPct.filter(x => x.pct > 80);
  if (critical.length > 0) {
    const msg = critical.map(x => `${x.col}: ${x.pct}% nulos`).join(', ');
    throw new Error(
      `❌ ABORTADO: ${msg} — as colunas de pagamento estão quase todas nulas.\n` +
      `   Verifique se os nomes das colunas no XLSX correspondem às esperadas:\n` +
      `   ${PAYMENT_COLS.join(', ')}\n` +
      `   Colunas encontradas no arquivo: ${colsPresent.join(', ')}`
    );
  }
}



function generateCreateTableSQL(tableName: string, headers: string[], sampleRows: Record<string, any>[]): string {
  const colDefs = headers.map(col => {
    const vals = sampleRows.slice(0, 50).map(r => r[col]);
    const colType = isNumericCol(vals) ? 'NUMERIC' : 'TEXT';
    return `  ${col.padEnd(35)} ${colType}`;
  });

  return [
    `-- ================================================================`,
    `-- Tabela: ${tableName}`,
    `-- Gerado em: ${new Date().toLocaleString('pt-BR')}`,
    `-- Colunas: ${headers.length} | Linhas estimadas: ${sampleRows.length}+`,
    `-- ================================================================`,
    ``,
    `CREATE TABLE IF NOT EXISTS public.${tableName} (`,
    `  id                                  BIGSERIAL PRIMARY KEY,`,
    colDefs.join(',\n'),
    `);`,
    ``,
    `-- Índices úteis para consultas LC 131`,
    `CREATE INDEX IF NOT EXISTS idx_${tableName}_ano`,
    `  ON public.${tableName} (ano_referencia);`,
    ``,
    `-- Para limpar e re-importar sem perder a estrutura:`,
    `-- TRUNCATE public.${tableName} RESTART IDENTITY;`,
  ].join('\n');
}

// ─── Upload para Supabase ─────────────────────────────────────────────────────

/** Converte '' e valores não-numéricos em colunas numéricas para null */
function sanitizeRows(rows: Record<string, any>[]): Record<string, any>[] {
  if (rows.length === 0) return rows;
  const headers = Object.keys(rows[0]);
  // Detecta colunas numéricas pela amostra
  const numericCols = new Set(
    headers.filter(h => isNumericCol(rows.slice(0, 100).map(r => r[h])))
  );
  return rows.map(row => {
    const clean: Record<string, any> = {};
    for (const h of headers) {
      const v = row[h];
      if (numericCols.has(h)) {
        if (v === '' || v == null) {
          clean[h] = null;
        } else {
          const n = Number(String(v).replace(',', '.'));
          clean[h] = isNaN(n) ? null : n;
        }
      } else {
        clean[h] = v === '' ? null : v;
      }
    }
    return clean;
  });
}

async function uploadToSupabase(tableName: string, rows: Record<string, any>[]): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  let uploaded = 0;

  const cleanRows = sanitizeRows(rows);

  // Safety check: abort if payment columns are all null
  validatePaymentCols(cleanRows);

  process.stdout.write(`\n📤 Enviando ${cleanRows.length.toLocaleString('pt-BR')} registros em chunks de ${CHUNK_SIZE}...\n`);

  for (let i = 0; i < cleanRows.length; i += CHUNK_SIZE) {
    const chunk = cleanRows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from(tableName).insert(chunk);
    if (error) {
      throw new Error(`Erro no chunk ${i}–${i + chunk.length}: ${error.message}\nDica: ${error.details ?? ''}`);
    }
    uploaded += chunk.length;
    const pct = Math.round((uploaded / cleanRows.length) * 100);
    process.stdout.write(`\r   ${pct.toString().padStart(3)}% concluído — ${uploaded.toLocaleString('pt-BR')} / ${cleanRows.length.toLocaleString('pt-BR')} registros`);
  }

  process.stdout.write('\n');
}

// ─── Pós-import automático ───────────────────────────────────────────────────

async function runPostImport(ano?: number): Promise<void> {
  const scriptPath = path.join(__importDir, 'post-import.mjs');
  if (!fs.existsSync(scriptPath)) {
    console.warn(`\n⚠️  post-import.mjs não encontrado em ${scriptPath}`);
    console.warn('   Execute manualmente: node scripts/run-fix-tipo.mjs');
    return;
  }
  const args = ano ? [scriptPath, String(ano)] : [scriptPath];
  return new Promise(resolve => {
    const child = spawn('node', args, { stdio: 'inherit' });
    child.on('error', err => {
      console.warn(`\n⚠️  Erro ao iniciar pós-import: ${err.message}`);
      console.warn(`   Execute manualmente: node scripts/post-import.mjs${ano ? ' ' + ano : ''}`);
      resolve();
    });
    child.on('close', code => {
      if (code !== 0) {
        console.warn(`\n⚠️  Pós-import terminou com código ${code}. Verifique acima.`);
        console.warn(`   Execute: node scripts/post-import.mjs${ano ? ' ' + ano : ''}`);
      }
      resolve(); // sempre resolve — o upload já foi salvo com sucesso
    });
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  // Flags
  const force      = args.includes('--force');       // pula confirmações interativas
  const doAppend   = args.includes('--append');      // adiciona sem limpar
  const doTrunc    = args.includes('--truncate');    // limpa SOMENTE o ano do arquivo
  const doTruncAll = args.includes('--truncate-all'); // ⚠️ limpa TUDO (todos os anos)

  // Arquivo
  const fileArg = args.find(a => !a.startsWith('--'));
  if (!fileArg) {
    console.error('\n❌  Uso: npx tsx scripts/import-lc131.ts <arquivo.xlsx> [--tabela nome] [--force] [--append] [--truncate]\n');
    process.exit(1);
  }
  const filePath = path.resolve(fileArg);
  if (!fs.existsSync(filePath)) {
    console.error(`\n❌  Arquivo não encontrado: ${filePath}\n`);
    process.exit(1);
  }

  // Nome da tabela
  const tableIdx = args.indexOf('--tabela');
  const tableName = tableIdx !== -1 && args[tableIdx + 1]
    ? normalizeColName(args[tableIdx + 1])
    : 'lc131_despesas';

  console.log('\n════════════════════════════════════════════════════════');
  console.log('  IMPORTADOR LC 131 → Supabase');
  console.log('════════════════════════════════════════════════════════');
  console.log(`  Arquivo : ${path.basename(filePath)}`);
  console.log(`  Tabela  : ${tableName}`);
  console.log(`  URL     : ${SUPABASE_URL}`);
  if (force)       console.log('  Modo    : --force (não-interativo)');
  if (doTrunc)     console.log('  Modo    : --truncate (apaga somente o ano do arquivo)');
  if (doTruncAll)  console.log('  Modo    : --truncate-all ⚠️ APAGA TODOS OS ANOS');
  if (doAppend)    console.log('  Modo    : --append (adiciona sem limpar)');
  console.log('════════════════════════════════════════════════════════\n');

  // 1. Lê e processa o arquivo
  const { headers, rows } = readXlsx(filePath);

  console.log(`\n📊 Resultado:`);
  console.log(`   ${rows.length.toLocaleString('pt-BR')} linhas de dados`);
  console.log(`   ${headers.length} colunas normalizadas:`);
  headers.forEach((h, i) => console.log(`      ${String(i + 1).padStart(2)}. ${h}`));

  // Detecta o ano dos dados para truncate seguro por ano
  const anoValues = rows
    .map(r => Number(r['ano_referencia']))
    .filter(v => v > 2000 && v < 2100);
  const anoDetectado: number | undefined = anoValues.length > 0
    ? Math.round(anoValues.reduce((a, b) => a + b, 0) / anoValues.length)
    : undefined;
  if (anoDetectado) console.log(`\n📅 Ano detectado no arquivo: ${anoDetectado}`);

  // Gera SQL
  const sql = generateCreateTableSQL(tableName, headers, rows.slice(0, 100));
  const sqlFile = path.join(path.dirname(filePath), `create_${tableName}.sql`);
  fs.writeFileSync(sqlFile, sql, { encoding: 'utf8' });
  console.log(`\n📄 SQL gerado/atualizado em: ${sqlFile}`);

  if (!force) {
    // Modo interativo: mostra SQL e aguarda confirmação
    console.log('\n' + '─'.repeat(60));
    console.log(sql);
    console.log('─'.repeat(60));
    console.log('\n⚠️  ANTES DE CONTINUAR:');
    console.log('   1. Copie o SQL acima');
    console.log('   2. Cole no Supabase Dashboard → SQL Editor');
    console.log('   3. Execute o SQL para criar a tabela');
    console.log('   4. Volte aqui e responda S\n');

    const ans = await ask('A tabela já foi criada no Supabase? (s/N): ');
    if (ans.trim().toLowerCase() !== 's') {
      console.log('\n⏸  Operação pausada. Execute o SQL e rode o script novamente.\n');
      process.exit(0);
    }

    const truncAns = await ask('Deseja limpar os dados DESTE ANO antes de importar? (s/N): ');
    if (truncAns.trim().toLowerCase() === 's') {
      if (anoDetectado) {
        await truncateTable(tableName, anoDetectado);
      } else {
        console.warn('   ⚠️  Ano não detectado. Use --truncate para apagar somente o ano correto.');
      }
    }
  } else {
    // Modo --force: verifica se a tabela existe antes de tentar inserir
    console.log('\n🔍 Verificando se a tabela existe no Supabase...');
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { error: probeErr } = await supabase.from(tableName).select('id').limit(1);
    if (probeErr) {
      console.error(`\n❌  Tabela "${tableName}" não encontrada ou sem permissão de acesso.`);
      console.error(`   Erro: ${probeErr.message}`);
      console.error(`\n📋 Execute o SQL abaixo no Supabase Dashboard → SQL Editor:\n`);
      console.error(sql);
      console.error('\nDepois rode novamente com --force.\n');
      process.exit(1);
    }
    console.log('   ✔ Tabela encontrada.');

    if (doTruncAll) {
      const confirm = await ask(`\n⚠️  --truncate-all apagará TODOS OS ANOS da tabela. Confirmar? (sim/N): `);
      if (confirm.trim().toLowerCase() !== 'sim') {
        console.log('Abortado.'); process.exit(0);
      }
      await truncateTable(tableName);
    } else if (doTrunc) {
      if (!anoDetectado) throw new Error('Não foi possível detectar o ano. Verifique a coluna ano_referencia.');
      await truncateTable(tableName, anoDetectado);
    } else if (!doAppend) {
      console.log('   ℹ️  Modo padrão: append seguro (use --truncate para apagar o ano antes)');
    }
  }

  // 3. Faz o upload
  await uploadToSupabase(tableName, rows);

  console.log(`\n✅ Upload concluído: ${rows.length.toLocaleString('pt-BR')} registros em "${tableName}"`);

  // 4. Pós-import automático: classifica, normaliza DRS/RRAS, corrige TABELA SUS, limpa bd_ref_tipo
  await runPostImport(anoDetectado);
}

async function truncateTable(tableName: string, anoToDelete?: number): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  if (anoToDelete) {
    // Seguro: apaga SOMENTE o ano sendo reimportado
    console.log(`\n🧹 Removendo registros do ano ${anoToDelete}...`);
    const { error, count } = await supabase
      .from(tableName)
      .delete({ count: 'exact' })
      .eq('ano_referencia', anoToDelete);
    if (error) {
      console.warn(`   ⚠️  Aviso ao limpar ano ${anoToDelete}: ${error.message}`);
    } else {
      console.log(`   ✔ ${(count ?? 0).toLocaleString('pt-BR')} registros de ${anoToDelete} removidos.`);
    }
  } else {
    // Modo legado: apaga tudo (somente com confirmação explícita --truncate-all)
    console.log('\n🧹 Limpando tabela inteira...');
    const { error } = await supabase.from(tableName).delete().not('id', 'is', null);
    if (error) {
      console.warn(`   ⚠️  Aviso ao limpar: ${error.message}`);
    } else {
      console.log('   ✔ Tabela limpa.');
    }
  }
}

main().catch(err => {
  console.error('\n❌ Erro fatal:', err.message);
  process.exit(1);
});
