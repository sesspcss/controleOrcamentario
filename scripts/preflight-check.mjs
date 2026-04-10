// Quick pre-flight check before reimport-all.mjs
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
const require2 = createRequire(import.meta.url);
const XLSX = require2('xlsx');

const sb = createClient(
  'https://odnstbeuiojohutoqvvw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kbnN0YmV1aW9qb2h1dG9xdnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTQ1NzgsImV4cCI6MjA5MDA5MDU3OH0._71Nt-rjs3EvOuDcGcQcPFKug-iDg_dEs38UVLBLJEQ'
);

function toSnake(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// 1. Read Excel 2026 headers
const wb = XLSX.readFile('C:\\Users\\afpereira\\Downloads\\LC31\\LC_131_2026.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
let headerIdx = 0;
for (let i = 0; i < Math.min(10, matrix.length); i++) {
  const row = matrix[i];
  const nonEmpty = row.filter(v => v !== '' && v != null);
  const textCells = nonEmpty.filter(v => typeof v === 'string' && isNaN(Number(v)));
  if (nonEmpty.length > 3 && textCells.length / nonEmpty.length > 0.6) { headerIdx = i; break; }
}
const headers = matrix[headerIdx].map(h => toSnake(String(h)));
console.log('Headers:', headers.join(', '));
console.log('Has descricao_processo:', headers.includes('descricao_processo'));
console.log('Has numero_processo:', headers.includes('numero_processo'));

// Sample first data row (columns 12-15 where processo should be)
const row0 = matrix[headerIdx + 1];
console.log('Sample (cols 12-15):', row0.slice(12, 16));

// 2. Check DB state
const { count } = await sb.from('lc131_despesas')
  .select('id', { count: 'exact', head: true })
  .eq('ano_referencia', 2026);
console.log('DB count 2026:', count);

const { data } = await sb.from('lc131_despesas')
  .select('descricao_processo,numero_processo')
  .eq('ano_referencia', 2026)
  .not('descricao_processo', 'is', null)
  .limit(1);
console.log('Filled processo sample:', data);

// 3. Test lc131_delete_year exists (dry call for year 9999 which has no rows)
const { data: d, error: e } = await sb.rpc('lc131_delete_year', { p_ano: 9999 });
console.log('lc131_delete_year test (year 9999):', d, e ? e.message : 'OK');

// 4. Test INSERT permission (insert + verify)
const testRow = { ano_referencia: 9999, nome_municipio: 'TEST_DELETE_ME' };
const { error: insErr } = await sb.from('lc131_despesas').insert(testRow);
console.log('INSERT test:', insErr ? `ERR: ${insErr.message}` : 'OK');

// Clean up test row
if (!insErr) {
  const { data: del2 } = await sb.rpc('lc131_delete_year', { p_ano: 9999 });
  console.log('Cleanup test row:', del2, 'deleted');
}

console.log('\n✅ Pre-flight complete');
