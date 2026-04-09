import { createClient } from '@supabase/supabase-js';
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
const sb = createClient('https://odnstbeuiojohutoqvvw.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kbnN0YmV1aW9qb2h1dG9xdnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTQ1NzgsImV4cCI6MjA5MDA5MDU3OH0._71Nt-rjs3EvOuDcGcQcPFKug-iDg_dEs38UVLBLJEQ');
console.log('Calling lc131_delete_year(2026)...');
const { data, error } = await sb.rpc('lc131_delete_year', { p_ano: 2026 });
console.log('Result:', data);
if (error) console.log('Error:', error.message, error.code, error.details);
else {
  const { count } = await sb.from('lc131_despesas').select('*', { count: 'exact', head: true }).eq('ano_referencia', 2026);
  console.log('Remaining 2026 records:', count);
}
