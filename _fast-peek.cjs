const XLSX = require('./node_modules/xlsx');

console.log('Lendo apenas primeiras 200 linhas...');
const wb = XLSX.readFile('C:/Users/afpereira/Downloads/bd_ref.xlsx', {
  sheetRows: 200  // only read first 200 rows
});
const ws = wb.Sheets['Planilha1'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

const headers = rows[0].map(String);
console.log('Headers:', JSON.stringify(headers));
console.log('Rows lidos:', rows.length);

// Count unique tipos nos primeiros 200 rows
const tipoIdx = headers.findIndex(h => String(h).toUpperCase().includes('TIPO DE DESPESA'));
console.log('\nCol TIPO idx:', tipoIdx);

const tipos = {};
for (let i = 1; i < rows.length; i++) {
  const tipo = String(rows[i][tipoIdx] || '').trim();
  if (tipo) tipos[tipo] = (tipos[tipo] || 0) + 1;
}
console.log('\nTIPOs distintos (primeiros 200 rows):');
Object.entries(tipos).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => 
  console.log(' ', String(v).padStart(5), '|', k)
);

// Show 5 diverse examples
console.log('\nLinhas de exemplo:');
for (let i = 1; i <= Math.min(10, rows.length-1); i++) {
  console.log('L'+(i+1)+':', rows[i].map(String).filter(v=>v).join(' | '));
}
