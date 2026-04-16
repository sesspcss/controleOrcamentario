const xlsx = require('xlsx');
const wb = xlsx.readFile('C:/Users/afpereira/Downloads/TIPO_DESPESA.xlsx');
const ws = wb.Sheets['BASE DE DADOS'];
const data = xlsx.utils.sheet_to_json(ws, { defval: '', header: 1 });
const map = {};
for (let i = 1; i < data.length; i++) {
  const tipo = (data[i][0] || '').toString().trim();
  const desc = (data[i][1] || '').toString().trim();
  if (!tipo && !desc) break;
  if (!map[tipo]) map[tipo] = new Set();
  if (desc) map[tipo].add(desc);
}
Object.keys(map).sort().forEach(tipo => {
  const descs = [...map[tipo]].sort().slice(0, 8);
  console.log('TIPO: ' + tipo);
  descs.forEach(d => console.log('  - ' + d));
});
console.log('\n=== Total tipos: ' + Object.keys(map).length);
