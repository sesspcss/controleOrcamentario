const XLSX = require('./node_modules/xlsx');

console.log('Lendo bd_ref.xlsx...');
const wb = XLSX.readFile('C:/Users/afpereira/Downloads/bd_ref.xlsx', { sheetStubs: false });
const ws = wb.Sheets['Planilha1'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

const headers = rows[0].map(String);
console.log('Headers:', JSON.stringify(headers));

// Count non-empty rows (at least the TIPO DE DESPESA column must be non-empty)
const tipoIdx = headers.findIndex(h => h.trim().toUpperCase().includes('TIPO'));
console.log('Índice coluna TIPO DE DESPESA:', tipoIdx);

let realRows = 0;
const tipos = {};
const tiposExemplos = {};

for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  const tipo = r[tipoIdx] ? String(r[tipoIdx]).trim() : '';
  if (!tipo) continue; // skip empty rows
  realRows++;
  tipos[tipo] = (tipos[tipo] || 0) + 1;
  if (!tiposExemplos[tipo]) {
    tiposExemplos[tipo] = {
      uo: String(r[0] || ''),
      ug: String(r[1] || ''),
      projeto: String(r[2] || ''),
      fonte: String(r[3] || ''),
      grupo: String(r[5] || ''),
      elemento: String(r[7] || ''),
      favorecido: String(r[10] || '').substring(0, 60),
      descricao: String(r[11] || '').substring(0, 60),
    };
  }
}

console.log('\nTotal linhas reais:', realRows);
console.log('\nDistribuição TIPO DE DESPESA:');
Object.entries(tipos).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => {
  console.log(' ', String(v).padStart(7), '|', k);
  if (tiposExemplos[k]) {
    const ex = tiposExemplos[k];
    console.log('         ex UG:', ex.ug.substring(0,70));
    console.log('         ex Projeto:', ex.projeto.substring(0,70));
    console.log('         ex Desc:', ex.descricao.substring(0,70));
  }
});
