/**
 * import-bdref-tipo.mjs
 * -----------------------------------------------------------------------
 * Importa bd_ref.xlsx → tabela bd_ref_tipo no Supabase
 * 
 * Estrutura do Excel (colunas fixas):
 *   0: Código Nome UO
 *   1: Código Nome UG
 *   2: Código Nome Projeto Atividade
 *   3: Código Nome Fonte Recurso
 *   4: FONTE DE RECURSOS
 *   5: Código Nome Grupo
 *   6: GRUPO DE DESPESA
 *   7: Código Nome Elemento
 *   8: TIPO DE DESPESA  ← campo chave de saída
 *   9: UNIDADE
 *  10: Código Nome Favorecido
 *  11: Descrição Processo
 *
 * USO:
 *   node scripts/import-bdref-tipo.mjs
 * -----------------------------------------------------------------------
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const SUPABASE_URL = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTc4OTA0NCwiZXhwIjoyMDkxMzY1MDQ0fQ.YUaFE11ZfuKAaRj1UMmhvLr3bN_1yjP9D2WDBcpBee0';
const FILE_PATH    = 'C:/Users/afpereira/Downloads/bd_ref.xlsx';
const TABLE        = 'bd_ref_tipo';
const CHUNK_SIZE   = 1000;
const SHEET_ROWS   = 0; // 0 = all rows (ler o arquivo todo)

const HEADERS = {
  apikey:        SERVICE_KEY,
  Authorization: 'Bearer ' + SERVICE_KEY,
  'Content-Type': 'application/json',
  Prefer:        'return=minimal',
};

function clean(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function normTipo(t) {
  if (!t) return t;
  // Normalizar variantes conhecidas
  const map = {
    'TRANFERÊNCIA VOLUNTÁRIA':       'TRANSFERÊNCIA VOLUNTÁRIA',
    'TRANFERENCIA VOLUNTARIA':       'TRANSFERÊNCIA VOLUNTÁRIA',
    'GESTAO ESTADUAL':               'GESTÃO ESTADUAL',
    'GESTÃO ESTADUAL':               'GESTÃO ESTADUAL',
    'ORGANIZACAO SOCIAL':            'ORGANIZAÇÃO SOCIAL',
    'CONVENIO':                      'CONVÊNIO',
    'CONTRATO GESTAO':               'ORGANIZAÇÃO SOCIAL',
    'CONTRATO DE GESTAO':            'ORGANIZAÇÃO SOCIAL',
    'INTRAORCAMENTARIA':             'INTRAORÇAMENTÁRIA',
    'RESIDENCIA TERAPEUTICA':        'RESIDÊNCIA TERAPÊUTICA',
    'CONTRIBUICAO DE SOLIDARIEDADE': 'CONTRIBUIÇÃO DE SOLIDARIEDADE',
    'UNIDADE PROPRIA':               'UNIDADE PRÓPRIA',
  };
  return map[t.trim().toUpperCase()] || t.trim();
}

async function upsertChunk(rows) {
  const url = `${SUPABASE_URL}/rest/v1/${TABLE}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...HEADERS, Prefer: 'return=minimal,resolution=merge-duplicates' },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HTTP ${res.status}: ${err.substring(0, 300)}`);
  }
}

async function main() {
  console.log(`\n📂 Lendo: ${FILE_PATH}`);
  const wb = XLSX.readFile(FILE_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];

  // Get real range
  const range = XLSX.utils.decode_range(ws['!ref']);
  const totalXlsxRows = range.e.r; // 0-indexed, row 0 = header
  console.log(`   Linhas no Excel (incluindo header): ${totalXlsxRows + 1}`);

  console.log('   Processando em lotes (pode demorar alguns minutos)...');

  let totalInserted = 0;
  let totalSkipped  = 0;
  let errors        = 0;
  const BATCH = 5000; // ler 5k linhas do Excel por vez para não estourar memória

  for (let startRow = 1; startRow <= totalXlsxRows; startRow += BATCH) {
    const endRow = Math.min(startRow + BATCH - 1, totalXlsxRows);

    // Read chunk from Excel
    const batch = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: '',
      range: { s: { r: startRow, c: 0 }, e: { r: endRow, c: 11 } },
    });

    const rows = [];
    for (const r of batch) {
      const tipo = clean(r[8]);
      if (!tipo) { totalSkipped++; continue; }

      rows.push({
        codigo_nome_uo:                clean(r[0]),
        codigo_nome_ug:                clean(r[1]),
        codigo_nome_projeto_atividade: clean(r[2]),
        codigo_nome_fonte_recurso:     clean(r[3]),
        fonte_recurso:                 clean(r[4]),
        codigo_nome_grupo:             clean(r[5]),
        grupo_despesa:                 clean(r[6]),
        codigo_nome_elemento:          clean(r[7]),
        tipo_despesa:                  normTipo(tipo),
        unidade:                       clean(r[9]),
        codigo_nome_favorecido:        clean(r[10]),
        descricao_processo:             clean(r[11]),
      });
    }

    if (rows.length === 0) continue;

    // Insert in supabase chunks
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      try {
        await upsertChunk(chunk);
        totalInserted += chunk.length;
      } catch (e) {
        console.error(`\n  ❌ Erro no chunk ${startRow + i}: ${e.message}`);
        errors++;
      }
    }
    process.stdout.write(`\r   ✅ ${totalInserted} inseridos, ${totalSkipped} vazios ignorados (processando até linha excel ${endRow})...`);
  }

  console.log(`\n\n🎉 Concluído!`);
  console.log(`   Inseridos: ${totalInserted}`);
  console.log(`   Ignorados (vazios): ${totalSkipped}`);
  console.log(`   Erros de chunk: ${errors}`);
}

main().catch(e => { console.error('Erro fatal:', e); process.exit(1); });
