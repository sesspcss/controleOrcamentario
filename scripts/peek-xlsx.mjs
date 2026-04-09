import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const filePath = process.argv[2];
if (!filePath) { console.error('Uso: node scripts/peek-xlsx.mjs <arquivo.xlsx>'); process.exit(1); }

const wb = XLSX.readFile(filePath);
const ws = wb.Sheets[wb.SheetNames[0]];
const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

console.log('Sheet:', wb.SheetNames[0]);
console.log('Total rows:', raw.length);
console.log('Headers:', JSON.stringify(raw[0]));
console.log('Row 1:', JSON.stringify(raw[1]));
console.log('Row 2:', JSON.stringify(raw[2]));
console.log('Last row:', JSON.stringify(raw[raw.length - 1]));
