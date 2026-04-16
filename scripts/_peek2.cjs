const XLSX = require('./node_modules/xlsx');
const wb = XLSX.readFile('C:/Users/afpereira/Downloads/bd_ref.xlsx');
console.log('Abas:', wb.SheetNames);
wb.SheetNames.forEach(function(name) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const r = rows[i].map(String).filter(function(v) { return v.trim(); });
    if (r.length > 3) {
      console.log('Aba [' + name + '] header row ' + (i+1) + ':', JSON.stringify(r));
      break;
    }
  }
  console.log('Total rows [' + name + ']:', rows.length);
  if (rows.length > 1) {
    console.log('Data row 1 [' + name + ']:', JSON.stringify(rows[1].map(String)));
  }
});
