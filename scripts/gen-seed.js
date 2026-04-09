import { createRequire } from 'module';
import { writeFileSync } from 'fs';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const filePath = 'C:/Users/afpereira/Downloads/DESPESAS - 2022 - 2023 - 2024 - 2025   2026 - 31-03-26.xlsx';
const wb = XLSX.readFile(filePath);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
const hdr = rows[0];

const iDRS    = hdr.indexOf('DRS');
const iRA     = hdr.indexOf('REGIÃO ADMINISTRATIVA');
const iRRAS   = hdr.indexOf('RRAS');
const iRS     = hdr.indexOf('Região de Saúde');
const iIBGE   = hdr.indexOf('Cód IBGE');
const iMun    = hdr.indexOf('MUNICÍPIO');
const iUG     = hdr.findIndex(c => String(c).includes('Código Nome UG'));
const iFonte  = hdr.indexOf('FONTE DE RECURSOS');
const iGrupo  = hdr.indexOf('GRUPO DE DESPESA');
const iTipo   = hdr.indexOf('TIPO DE DESPESA');
const iRotulo = hdr.indexOf('RÓTULO');

const codeMap = {};

for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r || r.every(v => v === '' || v == null)) continue;
  const ugFull = String(r[iUG] || '').trim();
  const codMatch = ugFull.match(/^(\d{6})/);
  if (!codMatch) continue;
  const cod = codMatch[1];
  if (codeMap[cod]) continue;

  const g = idx => String(r[idx] || '').trim();

  codeMap[cod] = {
    cod,
    unidade:    ugFull.replace(/^\d+\s*-\s*/, ''),
    drs:        g(iDRS),
    regiao_ad:  g(iRA),
    rras:       g(iRRAS),
    regiao_sa:  g(iRS),
    ibge:       g(iIBGE),
    mun:        g(iMun),
    fonte:      g(iFonte),
    grupo:      g(iGrupo),
    tipo:       g(iTipo),
    rotulo:     g(iRotulo),
  };
}

const Q = s => (s && String(s).trim()) ? "'" + String(s).replace(/'/g, "''") + "'" : 'NULL';

const vals = Object.values(codeMap).sort((a, b) => a.cod.localeCompare(b.cod));
const lines = vals.map(v =>
  '  (' + [Q(v.cod),Q(v.unidade),Q(v.drs),Q(v.regiao_ad),Q(v.rras),Q(v.regiao_sa),Q(v.ibge),Q(v.mun),Q(v.fonte),Q(v.grupo),Q(v.tipo),Q(v.rotulo)].join(', ') + ')'
).join(',\n');

writeFileSync('scripts/seed-sql.txt', lines, 'utf8');
console.log('Wrote', vals.length, 'rows to scripts/seed-sql.txt');
