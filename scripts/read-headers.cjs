// Lê headers de um Excel LC131 e mostra
const { createRequire } = require('module');
const XLSX = require('xlsx');

const files = [
  'C:\\Users\\afpereira\\Downloads\\LC31\\LC_131_2025.xlsx',
  'C:\\Users\\afpereira\\Downloads\\LC 131 - Despesas  - região (3).xlsx',
];

function normalizeColName(raw) {
  return String(raw).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '').replace(/__+/g, '_') || 'col_vazia';
}

for (const f of files) {
  try {
    const wb = XLSX.readFile(f);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    
    // Find header row
    let headerIdx = 0;
    for (let i = 0; i < Math.min(10, raw.length); i++) {
      const row = raw[i];
      const nonEmpty = row.filter(v => v !== '' && v != null);
      const textCells = nonEmpty.filter(v => typeof v === 'string' && isNaN(Number(v)));
      if (nonEmpty.length >= 3 && textCells.length / nonEmpty.length > 0.6) {
        headerIdx = i; break;
      }
    }
    
    const headers = raw[headerIdx].map(String);
    const normalized = headers.map(normalizeColName);
    
    console.log(`\n=== ${f.split('\\').pop()} ===`);
    console.log(`Header row: ${headerIdx + 1}, ${headers.length} colunas\n`);
    
    const processCols = headers.map((h, i) => ({ raw: h, norm: normalized[i], i }))
      .filter(x => x.norm.includes('processo') || x.norm.includes('descricao') || x.norm.includes('numero'));
    
    if (processCols.length) {
      console.log('Colunas processo/descricao/numero:');
      processCols.forEach(x => console.log(`  [${x.i}] "${x.raw}" → ${x.norm}`));
    } else {
      console.log('NENHUMA coluna com "processo/descricao/numero"!');
    }
    
    console.log('\nTODAS as colunas:');
    headers.forEach((h, i) => console.log(`  [${i}] "${h}" → ${normalized[i]}`));
    
  } catch (e) { console.log(`\n!!! ${f}: ${e.message}`); }
}
