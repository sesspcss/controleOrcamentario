import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://teikzwrfsxjipxozzhbr.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODkwNDQsImV4cCI6MjA5MTM2NTA0NH0.t3tWIh3F9lmg-a6zzdmoKpupHB9i7hTfvFmPyFbZNZs'
);

const terms = [
  'PPP', 'BATA CINZA',
  'RLM',
  'SISTEMA PRISIONAL',
  'REDE LUCY MONTORO',
  'PISO ENFERM',
  'CASAS DE APOIO',
  'INTRAORCAMENTARIA', 'INTRAORÇ',
  'HEMOCENTRO',
  'ONCOCENT', 'ONCOCENTRO',
  'HCFAMEMA', 'FAMEMA',
  'NAOR BOTUCATU',
  'HCRIB', 'RIBEIRAO',
  'CONTRATO GESTAO', 'CONTRATO DE GESTAO', 'CONT. DE GESTAO', 'CONT.DE GESTAO',
  'DIVIDA',
  'RESIDENCIA TERAPEUTICA',
  'CIRURGIA ELETIVA',
  'TABELA SUS',
  'LUCY MONTORO',
  'AUTARQUIA',
  'FURP',
  'REPELENTE',
];

for (const term of terms) {
  const { data, error } = await sb
    .from('lc131_despesas')
    .select('descricao_processo')
    .ilike('descricao_processo', `%${term}%`)
    .limit(8);
  if (error) { console.log(term + ': ERR ' + error.message); continue; }
  const uniq = [...new Set(data.map(r => r.descricao_processo))];
  if (uniq.length) console.log(term + ':\n  ' + uniq.join('\n  '));
  else console.log(term + ': (none)');
}
