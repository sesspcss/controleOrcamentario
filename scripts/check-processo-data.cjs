// Verifica se os dados de processo existem no Excel
const XLSX = require('xlsx');

const files = [
  ['C:\\Users\\afpereira\\Downloads\\LC31\\LC_131_2025.xlsx', 2025],
  ['C:\\Users\\afpereira\\Downloads\\LC 131 - Despesas  - região (3).xlsx', 2026],
];

for (const [f, year] of files) {
  try {
    const wb = XLSX.readFile(f);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    
    // col 13 = Descrição Processo, col 14 = Número Processo
    const descCol = 13, numCol = 14;
    
    let descCount = 0, numCount = 0, total = 0;
    const descSamples = [], numSamples = [];
    
    for (let i = 1; i < raw.length; i++) {
      const row = raw[i];
      if (row.every(v => v === '' || v == null)) continue;
      total++;
      
      const desc = row[descCol];
      const num = row[numCol];
      
      if (desc != null && desc !== '' && String(desc).trim() !== '') {
        descCount++;
        if (descSamples.length < 5) descSamples.push(String(desc).substring(0, 80));
      }
      if (num != null && num !== '' && String(num).trim() !== '') {
        numCount++;
        if (numSamples.length < 5) numSamples.push(String(num).substring(0, 80));
      }
    }
    
    console.log(`\n=== ${year} (${total} rows) ===`);
    console.log(`  descricao_processo: ${descCount}/${total} preenchidos`);
    if (descSamples.length) console.log('    amostras:', descSamples);
    console.log(`  numero_processo: ${numCount}/${total} preenchidos`);
    if (numSamples.length) console.log('    amostras:', numSamples);
    
  } catch (e) { console.log(`!!! ${year}: ${e.message}`); }
}
