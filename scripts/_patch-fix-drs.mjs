import { readFileSync, writeFileSync } from 'fs';
const content = readFileSync('scripts/fix-drs.mjs', 'utf8');
const cutAt = content.lastIndexOf('\nmain().catch(');
const mainLine = "\nmain().catch(err => { console.error('\\n❌', err.message); process.exit(1); });\n";
writeFileSync('scripts/fix-drs.mjs', content.substring(0, cutAt) + mainLine, 'utf8');
console.log('ok, linhas:', readFileSync('scripts/fix-drs.mjs','utf8').split('\n').length);
