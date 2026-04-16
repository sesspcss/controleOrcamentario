process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const XLSX = require('C:/Users/afpereira/Downloads/controleOrcamento/node_modules/xlsx');
const wb = XLSX.readFile('C:/Users/afpereira/Downloads/bd_ref.xlsx');
console.log('Abas:', wb.SheetNames);
wb.SheetNames.forEach(name => {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const r = rows[i].map(String).filter(v => v.trim());
    if (r.length > 3) {
      console.log('Aba [' + name + '] linha ' + (i + 1) + ' headers:', r.join(' | '));
      break;
    }
  }
  console.log('Total linhas [' + name + ']:', rows.length);
  if (rows.length > 1) {
    console.log('1a linha dados [' + name + ']:', rows[1].map(String).join(' | '));
  }
});
