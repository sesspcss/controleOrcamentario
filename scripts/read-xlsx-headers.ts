// Read headers from DRS.xlsx and RRAS.xlsx to see all available columns
import XLSX from 'xlsx';
const { readFile, utils } = XLSX;
import { existsSync, readdirSync } from 'fs';

const files = [
  'C:\\Users\\afpereira\\Downloads\\LC31\\DRS.xlsx',
  'C:\\Users\\afpereira\\Downloads\\LC31\\RRAS.xlsx',
  // Try common locations for BD REF file
  'C:\\Users\\afpereira\\Downloads\\LC31\\BD_REF.xlsx',
  'C:\\Users\\afpereira\\Downloads\\LC31\\bd_ref.xlsx',
  'C:\\Users\\afpereira\\Downloads\\LC31\\DESPESAS - 2022 - 2023 - 2024 - 2025 2026.xlsx',
  'C:\\Users\\afpereira\\Downloads\\DESPESAS - 2022 - 2023 - 2024 - 2025   2026 - 31-03-26.xlsx',
];

// Also scan Downloads folder for any xlsx that might be BD REF
const dlDir = 'C:\\Users\\afpereira\\Downloads';
const lc31Dir = 'C:\\Users\\afpereira\\Downloads\\LC31';

console.log('=== Files in LC31 folder ===');
try {
  readdirSync(lc31Dir).filter(f => f.endsWith('.xlsx') || f.endsWith('.xls')).forEach(f => console.log(`  ${f}`));
} catch (e) { console.log('  (folder not found)'); }

console.log('\n=== XLSX files in Downloads (search for BD REF) ===');
try {
  readdirSync(dlDir)
    .filter(f => (f.endsWith('.xlsx') || f.endsWith('.xls')) && !f.startsWith('~'))
    .forEach(f => console.log(`  ${f}`));
} catch (e) { console.log('  (error reading)'); }

for (const filePath of files) {
  if (!existsSync(filePath)) continue;
  console.log(`\n=== ${filePath} ===`);
  const wb = readFile(filePath);
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const data = utils.sheet_to_json(ws, { header: 1 });
    if (data.length === 0) continue;
    
    // Find header row (first row with multiple non-empty cells)
    let headerRow = 0;
    for (let i = 0; i < Math.min(10, data.length); i++) {
      const row = data[i];
      const nonEmpty = row ? row.filter(c => c !== undefined && c !== null && String(c).trim() !== '').length : 0;
      if (nonEmpty >= 2) { headerRow = i; break; }
    }
    
    const headers = data[headerRow];
    console.log(`  Sheet: "${sheetName}" (${data.length} rows)`);
    console.log(`  Header row ${headerRow}: ${JSON.stringify(headers)}`);
    
    // Show first 3 data rows
    for (let i = headerRow + 1; i < Math.min(headerRow + 4, data.length); i++) {
      console.log(`  Row ${i}: ${JSON.stringify(data[i])}`);
    }
  }
}
