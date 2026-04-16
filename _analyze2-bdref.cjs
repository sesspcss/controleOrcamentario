const XLSX = require('./node_modules/xlsx');

console.log('Lendo bd_ref.xlsx (range real)...');
const wb = XLSX.readFile('C:/Users/afpereira/Downloads/bd_ref.xlsx');
const ws = wb.Sheets['Planilha1'];

// Get actual data range from worksheet ref
console.log('Ref do worksheet:', ws['!ref']);

// Read only the actual range
const range = XLSX.utils.decode_range(ws['!ref']);
console.log('Range:', range.s.r, '-', range.e.r, 'rows,', range.s.c, '-', range.e.c, 'cols');
console.log('Real row count:', range.e.r - range.s.r + 1);

// Read just first 5 data rows to understand structure
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', range: 0 });
const headers = rows[0].map(String);
console.log('\nHeaders:', JSON.stringify(headers));
console.log('\nRow 2:', JSON.stringify(rows[1] ? rows[1].map(String) : []));
console.log('Row 3:', JSON.stringify(rows[2] ? rows[2].map(String) : []));

// Quick count with sheet_to_json (objects) to ignore empty rows
const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
console.log('\nLinhas com dados (ignora vazias):', data.length);

// Count tipos
const tipos = {};
const tipoCol = headers.findIndex(h => String(h).toUpperCase().includes('TIPO DE DESPESA'));
console.log('Col TIPO:', tipoCol, '=', headers[tipoCol]);

data.slice(0, 5).forEach((r, i) => {
  console.log('Linha '+(i+2)+':', JSON.stringify(r));
});
