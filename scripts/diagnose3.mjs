import { createClient } from '@supabase/supabase-js';
const sb = createClient(
  'https://odnstbeuiojohutoqvvw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kbnN0YmV1aW9qb2h1dG9xdnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTQ1NzgsImV4cCI6MjA5MDA5MDU3OH0._71Nt-rjs3EvOuDcGcQcPFKug-iDg_dEs38UVLBLJEQ'
);

// Get distinct codigo_nome_ug values for 2026
const { data: ugs } = await sb.from('lc131_despesas')
  .select('codigo_nome_ug')
  .eq('ano_referencia', 2026)
  .limit(5000);
const distinct = [...new Set((ugs||[]).map(r => r.codigo_nome_ug).filter(Boolean))].sort();
console.log(`Distinct UGs (2026): ${distinct.length}`);
distinct.forEach(u => console.log(`  ${u}`));

// Get distinct codigo_nome_projeto_atividade 
const { data: pas } = await sb.from('lc131_despesas')
  .select('codigo_nome_projeto_atividade')
  .eq('ano_referencia', 2026)
  .limit(5000);
const distinctPA = [...new Set((pas||[]).map(r => r.codigo_nome_projeto_atividade).filter(Boolean))].sort();
console.log(`\nDistinct Projetos/Atividades (2026): ${distinctPA.length}`);
distinctPA.forEach(p => console.log(`  ${p}`));

// Check tipo_despesa values
const { data: tipos } = await sb.from('lc131_despesas')
  .select('tipo_despesa')
  .eq('ano_referencia', 2026)
  .not('tipo_despesa', 'is', null)
  .limit(5000);
const distinctTipo = [...new Set((tipos||[]).map(r => r.tipo_despesa).filter(Boolean))].sort();
console.log(`\nDistinct Tipo Despesa (2026): ${distinctTipo.length}`);
distinctTipo.forEach(t => console.log(`  ${t}`));
