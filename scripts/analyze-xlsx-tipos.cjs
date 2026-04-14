// analyze-xlsx-tipos.cjs
// Check what distinct tipo_despesa values exist in the XLSX

const XLSX = require('xlsx');
const wb = XLSX.readFile('C:/Users/afpereira/Downloads/TIPO_DESPESA.xlsx');
const ws = wb.Sheets['BASE DE DADOS'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
const header = rows[0].map(c => String(c || '').trim());
const tipoIdx = header.findIndex(c => c.toUpperCase().includes('TIPO DE DESPESA') || c.toUpperCase() === 'TIPO DE DESPESA');
const descIdx = header.findIndex(c => c.toUpperCase().includes('DESCRI'));
console.log('Headers:', JSON.stringify(header.slice(0, 8)));
console.log('tipoIdx:', tipoIdx, 'descIdx:', descIdx);

// Count distinct raw tipos
const rawCounts = new Map();
for (let i = 1; i < rows.length; i++) {
  const t = String(rows[i][tipoIdx] || '').trim();
  if (t) rawCounts.set(t, (rawCounts.get(t) || 0) + 1);
}
const sorted = [...rawCounts.entries()].sort((a, b) => b[1] - a[1]);
console.log('\nDISTINCT TIPOS (' + sorted.length + '):');
sorted.forEach(([t, c]) => console.log('  ' + c + '\t' + t));
