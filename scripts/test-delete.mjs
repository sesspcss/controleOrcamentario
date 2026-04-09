import { createClient } from '@supabase/supabase-js';
const sb = createClient(
  'https://odnstbeuiojohutoqvvw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kbnN0YmV1aW9qb2h1dG9xdnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTQ1NzgsImV4cCI6MjA5MDA5MDU3OH0._71Nt-rjs3EvOuDcGcQcPFKug-iDg_dEs38UVLBLJEQ'
);

// Test delete: try deleting 1 row to see if anon has permission
const { data: testRow } = await sb.from('lc131_despesas')
  .select('id')
  .eq('ano_referencia', 2026)
  .limit(1)
  .single();

if (testRow) {
  const { error } = await sb.from('lc131_despesas')
    .delete()
    .eq('id', testRow.id);
  if (error) {
    console.log('DELETE not allowed:', error.message);
  } else {
    console.log('DELETE works! Deleted test row id:', testRow.id);
  }
} else {
  console.log('No rows found');
}
