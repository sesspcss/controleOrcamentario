/**
 * import-tab-municipios.mjs
 * -----------------------------------------------------------------------
 * Importa o arquivo de referência geográfica oficial
 * "DRS-REGIÃOADMINISTRATIVA-RRAS-RegiãodeSaúde-CódIBGE-MUNICÍPIO.xlsx"
 * para a tabela tab_municipios no Supabase.
 *
 * Esta tabela SUBSTITUI as antigas tab_drs e tab_rras.
 *
 * USO:
 *   node scripts/import-tab-municipios.mjs "C:\caminho\para\arquivo.xlsx"
 *
 * EXEMPLO:
 *   node scripts/import-tab-municipios.mjs "C:\Users\afpereira\Downloads\LC31\DRS-REGIÃOADMINISTRATIVA-RRAS-RegiãodeSaúde-CódIBGE-MUNICÍPIO.xlsx"
 * -----------------------------------------------------------------------
 */

import { createRequire } from 'module';
import { createClient } from '@supabase/supabase-js';

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const SUPABASE_URL = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODkwNDQsImV4cCI6MjA5MTM2NTA0NH0.t3tWIh3F9lmg-a6zzdmoKpupHB9i7hTfvFmPyFbZNZs';
const CHUNK_SIZE   = 500;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Normaliza nome de município para chave: MAIÚSCULAS sem acentos
function norm(raw) {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');
}

// Formata RRAS numérico como "RRAS 01"
function fmtRras(val) {
  const n = parseInt(String(val).replace(/\D/g, ''));
  if (!n || isNaN(n)) return null;
  return `RRAS ${String(n).padStart(2, '0')}`;
}

// Formata IBGE como string de 6 dígitos
function fmtIbge(val) {
  const n = parseInt(String(val).replace(/\D/g, ''));
  if (!n || isNaN(n)) return null;
  return String(n);
}

const xlsxPath = process.argv[2] || 
  'C:\\Users\\afpereira\\Downloads\\LC31\\DRS-REGIÃOADMINISTRATIVA-RRAS-RegiãodeSaúde-CódIBGE-MUNICÍPIO.xlsx';

console.log(`Lendo: ${xlsxPath}`);
const wb   = XLSX.readFile(xlsxPath);
const ws   = wb.Sheets[wb.SheetNames[0]];
const raw  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

// Cabeçalho esperado:  DRS | REGIÃO ADMINISTRATIVA | RRAS | Região de Saúde | Cód IBGE | MUNICÍPIO
// Confirmar índices dinamicamente
const hdr = raw[0].map(h => String(h).trim().toLowerCase());
const iDrs     = hdr.findIndex(h => h.startsWith('drs'));
const iRegiaoAd= hdr.findIndex(h => h.includes('administrativa') || h.includes('admin'));
const iRras    = hdr.findIndex(h => h === 'rras');
const iRegiaoSa= hdr.findIndex(h => h.includes('regi') && h.includes('sa') && !h.includes('admin'));
const iIbge    = hdr.findIndex(h => h.includes('ibge') || h.includes('c\u00f3d'));
const iMunic   = hdr.findIndex(h => h.includes('munic'));

console.log('Colunas detectadas:', { iDrs, iRegiaoAd, iRras, iRegiaoSa, iIbge, iMunic });
if ([iDrs, iRegiaoAd, iRras, iIbge, iMunic].some(i => i < 0)) {
  console.error('ERRO: não encontrou todas as colunas. Cabeçalho:', raw[0]);
  process.exit(1);
}

const rows = [];
const seen = new Set();
let skipped = 0;

for (let i = 1; i < raw.length; i++) {
  const r = raw[i];
  const municipioRaw = String(r[iMunic] ?? '').trim();
  if (!municipioRaw) { skipped++; continue; }

  const municipioKey = norm(municipioRaw);
  if (seen.has(municipioKey)) { skipped++; continue; } // deduplicate
  seen.add(municipioKey);

  const drsVal    = String(r[iDrs]      ?? '').trim() || null;
  const regiaoAd  = String(r[iRegiaoAd] ?? '').trim() || null;
  const rrasNum   = fmtRras(r[iRras]);
  const regiaoSa  = iRegiaoSa >= 0 ? (String(r[iRegiaoSa] ?? '').trim() || null) : null;
  const codIbge   = fmtIbge(r[iIbge]);

  rows.push({
    municipio:    municipioKey,       // chave de lookup (normalizada)
    municipio_orig: municipioRaw,     // original com acentos
    drs:          drsVal,
    regiao_ad:    regiaoAd,
    rras:         rrasNum,
    regiao_sa:    regiaoSa,
    cod_ibge:     codIbge,
  });
}

console.log(`Linhas prontas: ${rows.length} (ignoradas/dup: ${skipped})`);

// Amostras
console.log('Amostra:', rows.slice(0, 3));

// Truncar e reinserir
console.log('\nTruncando tab_municipios...');

// Usar upsert para segurança
let total = 0;
for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
  const chunk = rows.slice(i, i + CHUNK_SIZE);
  const { error } = await supabase
    .from('tab_municipios')
    .upsert(chunk, { onConflict: 'municipio' });
  if (error) {
    console.error(`Erro no chunk ${i / CHUNK_SIZE + 1}:`, error.message);
    process.exit(1);
  }
  total += chunk.length;
  process.stdout.write(`  ${total}/${rows.length} inseridos...\r`);
}

console.log(`\n✓ ${total} municípios importados para tab_municipios`);
console.log('\nPróximos passos:');
console.log('1. Execute scripts/migrate-to-tab-municipios.sql no Supabase SQL Editor');
console.log('2. Execute scripts/fix-empty-cols.sql para re-enriquecer lc131_despesas');
