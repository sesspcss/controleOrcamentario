/**
 * gen-drs-rras-seed.cjs
 * Reads DRS.xlsx and RRAS.xlsx and generates a SQL file with all INSERT statements.
 * Run from project root: node scripts/gen-drs-rras-seed.cjs
 */
const XLSX = require('xlsx');
const fs   = require('fs');
const path = require('path');

const DRS_FILE  = 'C:/Users/afpereira/Downloads/LC31/DRS.xlsx';
const RRAS_FILE = 'C:/Users/afpereira/Downloads/LC31/RRAS.xlsx';
const OUT_FILE  = path.join(__dirname, 'seed-drs-rras.sql');

function normalize(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function esc(s) {
  return String(s).replace(/'/g, "''");
}

function readExcel(filePath, colMunicipio, colValor) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const map = new Map();
  for (let i = 1; i < raw.length; i++) {
    const mun = String(raw[i][colMunicipio] || '').trim();
    const val = String(raw[i][colValor]     || '').trim();
    if (!mun || !val) continue;
    map.set(normalize(mun), val);
  }
  return map;
}

// DRS: col 0 = DRS name, col 1 = Municipio
const drsMap  = readExcel(DRS_FILE,  1, 0);
// RRAS: col 0 = RRAS name, col 1 = Municipio
const rrasMap = readExcel(RRAS_FILE, 1, 0);

console.log(`DRS:  ${drsMap.size} municípios`);
console.log(`RRAS: ${rrasMap.size} municípios`);

const lines = [
  '-- ================================================================',
  '-- seed-drs-rras.sql',
  '-- Gerado automaticamente por scripts/gen-drs-rras-seed.cjs',
  '-- Execute no Supabase Dashboard → SQL Editor',
  '-- ================================================================',
  '',
  '-- Corrige o RLS das tabelas de referência (permite escrita)',
  'ALTER TABLE public.tab_drs  DISABLE ROW LEVEL SECURITY;',
  'ALTER TABLE public.tab_rras DISABLE ROW LEVEL SECURITY;',
  '',
  '-- Dá acesso público de leitura sem RLS (GRANT já garante isso)',
  'GRANT SELECT ON public.tab_drs  TO anon, authenticated;',
  'GRANT SELECT ON public.tab_rras TO anon, authenticated;',
  '',
  '-- ──────────────── tab_drs ────────────────────────────────────────',
  `INSERT INTO public.tab_drs (municipio, drs) VALUES`,
];

const drsValues = [...drsMap.entries()].map(([m, d]) => `  ('${esc(m)}', '${esc(d)}')`);
lines.push(drsValues.join(',\n'));
lines.push(`ON CONFLICT (municipio) DO UPDATE SET drs = EXCLUDED.drs;`);
lines.push('');
lines.push(`SELECT COUNT(*) AS total_drs FROM public.tab_drs;`);
lines.push('');
lines.push('-- ──────────────── tab_rras ──────────────────────────────────────');
lines.push(`INSERT INTO public.tab_rras (municipio, rras) VALUES`);

const rrasValues = [...rrasMap.entries()].map(([m, r]) => `  ('${esc(m)}', '${esc(r)}')`);
lines.push(rrasValues.join(',\n'));
lines.push(`ON CONFLICT (municipio) DO UPDATE SET rras = EXCLUDED.rras;`);
lines.push('');
lines.push(`SELECT COUNT(*) AS total_rras FROM public.tab_rras;`);

fs.writeFileSync(OUT_FILE, lines.join('\n'), 'utf8');
console.log(`\n✅ Gerado: ${OUT_FILE}`);
console.log('Execute este arquivo no Supabase SQL Editor.');
