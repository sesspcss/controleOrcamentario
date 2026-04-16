const XLSX = require('./node_modules/xlsx');
const wb = XLSX.readFile('C:/Users/afpereira/Downloads/bd_ref.xlsx');
console.log('Abas:', wb.SheetNames);
wb.SheetNames.forEach(function(name) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  for (var i = 0; i < Math.min(5, rows.length); i++) {
    var r = rows[i].map(String).filter(function(v){ return v.trim(); });
    if (r.length > 3) {
      console.log('Header['+name+'] row'+(i+1)+':', JSON.stringify(r));
      break;
    }
  }
  console.log('TotalRows['+name+']:', rows.length);
  if (rows.length > 1) {
    console.log('DataRow1['+name+']:', JSON.stringify(rows[1].map(String)));
  }
  if (rows.length > 2) {
    console.log('DataRow2['+name+']:', JSON.stringify(rows[2].map(String)));
  }
});
