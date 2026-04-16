process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const XLSX = require('./node_modules/xlsx');

console.log('Lendo bd_ref.xlsx com sheetRows=50000...');
const wb = XLSX.readFile('C:/Users/afpereira/Downloads/bd_ref.xlsx', { sheetRows: 50000 });
const ws = wb.Sheets['Planilha1'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

// Col indices based on header: 
// 0: Código Nome UO
// 1: Código Nome UG
// 2: Código Nome Projeto Atividade
// 3: Código Nome Fonte Recurso
// 4: FONTE DE RECURSOS
// 5: Código Nome Grupo
// 6: GRUPO DE DESPESA
// 7: Código Nome Elemento
// 8: TIPO DE DESPESA
// 9: UNIDADE
// 10: Código Nome Favorecido
// 11: Descrição Processo

const tipos = {};
const uo_por_tipo = {};
const ug_por_tipo = {};
const proj_por_tipo = {};
const desc_por_tipo = {};
const elem_por_tipo = {};

for (let i = 1; i < rows.length; i++) {
  const tipo = String(rows[i][8] || '').trim();
  if (!tipo) continue;
  tipos[tipo] = (tipos[tipo] || 0) + 1;
  
  if (!ug_por_tipo[tipo]) {
    ug_por_tipo[tipo] = String(rows[i][1] || '').trim();
    uo_por_tipo[tipo] = String(rows[i][0] || '').trim();
    proj_por_tipo[tipo] = String(rows[i][2] || '').trim();
    desc_por_tipo[tipo] = String(rows[i][11] || '').trim();
    elem_por_tipo[tipo] = String(rows[i][7] || '').trim();
  }
}

console.log('\nTodos TIPOs distintos (50k rows):');
Object.entries(tipos).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => {
  console.log('\n  ' + String(v).padStart(7) + ' | ' + k);
  console.log('         UG:', ug_por_tipo[k].substring(0,80));
  console.log('         Projeto:', proj_por_tipo[k].substring(0,80));
  console.log('         Desc:', desc_por_tipo[k].substring(0,80));
  console.log('         Elem:', elem_por_tipo[k].substring(0,60));
});
console.log('\nTotal tipos:', Object.keys(tipos).length);
console.log('Total rows lidos:', rows.length - 1);
