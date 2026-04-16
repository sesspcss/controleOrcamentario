process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const XLSX = require('./node_modules/xlsx');

console.log('Lendo bd_ref.xlsx com sheetRows=5000...');
const wb = XLSX.readFile('C:/Users/afpereira/Downloads/bd_ref.xlsx', { sheetRows: 5000 });
const ws = wb.Sheets['Planilha1'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

const headers = rows[0].map(String);
const tipoIdx = 8; // "TIPO DE DESPESA"

const tipos = {};
for (let i = 1; i < rows.length; i++) {
  const tipo = String(rows[i][tipoIdx] || '').trim();
  if (tipo) tipos[tipo] = (tipos[tipo] || 0) + 1;
}
console.log('\nTIPOs distintos nos primeiros 5000 rows:');
Object.entries(tipos).sort((a,b) => b[1]-a[1]).forEach(([k,v]) =>
  console.log(' ', String(v).padStart(7), '|', k)
);
console.log('\nTotal tipos distintos:', Object.keys(tipos).length);
