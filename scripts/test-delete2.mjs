import { createClient } from '@supabase/supabase-js';
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
const sb = createClient('https://odnstbeuiojohutoqvvw.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kbnN0YmV1aW9qb2h1dG9xdnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTQ1NzgsImV4cCI6MjA5MDA5MDU3OH0._71Nt-rjs3EvOuDcGcQcPFKug-iDg_dEs38UVLBLJEQ');

const { count } = await sb.from('lc131_despesas').select('*', { count: 'exact', head: true }).eq('ano_referencia', 2026);
console.log('2026 records remaining:', count);

if (count > 0) {
  // Test: fetch 5 IDs
  const { data: sample } = await sb.from('lc131_despesas').select('id').eq('ano_referencia', 2026).limit(5);
  console.log('Sample IDs:', sample?.map(r=>r.id));

  // Test delete with .in()
  if (sample && sample.length > 0) {
    const ids = sample.map(r => r.id);
    const { data: del, error } = await sb.from('lc131_despesas').delete().in('id', ids).select('id');
    console.log('Delete result:', del?.length, 'deleted. Error:', error?.message);
    
    // Verify
    const { count: after } = await sb.from('lc131_despesas').select('*', { count: 'exact', head: true }).eq('ano_referencia', 2026);
    console.log('After delete:', after, '(should be', count - (del?.length || 0), ')');
  }
}
