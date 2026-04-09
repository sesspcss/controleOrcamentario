import { createClient } from '@supabase/supabase-js';
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
const sb = createClient('https://odnstbeuiojohutoqvvw.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kbnN0YmV1aW9qb2h1dG9xdnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTQ1NzgsImV4cCI6MjA5MDA5MDU3OH0._71Nt-rjs3EvOuDcGcQcPFKug-iDg_dEs38UVLBLJEQ');

// Test 1: delete with eq (single ID)
const { data: sample } = await sb.from('lc131_despesas').select('id').eq('ano_referencia', 2026).limit(1).single();
console.log('Test ID:', sample?.id);

const { error: e1 } = await sb.from('lc131_despesas').delete().eq('id', sample.id);
console.log('eq() delete error:', e1?.message || 'none');

const { count: c1 } = await sb.from('lc131_despesas').select('*', { count: 'exact', head: true }).eq('ano_referencia', 2026);
console.log('After eq delete:', c1);

// Test 2: delete with lt (range-based)
const { data: batch } = await sb.from('lc131_despesas').select('id').eq('ano_referencia', 2026).order('id').limit(100);
const maxId = batch[batch.length - 1].id;
const minId = batch[0].id;
console.log(`\nRange delete: id >= ${minId} AND id <= ${maxId} (${batch.length} IDs)`);

const { error: e2 } = await sb.from('lc131_despesas').delete().eq('ano_referencia', 2026).gte('id', minId).lte('id', maxId);
console.log('Range delete error:', e2?.message || 'none');

const { count: c2 } = await sb.from('lc131_despesas').select('*', { count: 'exact', head: true }).eq('ano_referencia', 2026);
console.log('After range delete:', c2, '(expected', c1 - batch.length, ')');
