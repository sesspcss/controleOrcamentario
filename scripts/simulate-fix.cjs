// simulate-fix.cjs - shows what types would appear after the fix
const XLSX = require('xlsx');

function norm(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();
}
function canonTipo(raw) {
  const n = norm(raw);
  switch (n) {
    case 'EMENDAS':           return 'EMENDA';
    case 'GESTAO ESTADUAL':   return 'GESTÃO ESTADUAL';
    case 'TABELASUS PAULISTA': return 'TABELA SUS PAULISTA';
    case 'PISO DA ENFERMAGEM': return 'PISO ENFERMAGEM';
    case 'RLM FERNANDOPOLIS': return 'RLM FERNANDÓPOLIS';
    case 'RLM PARIQUERA ACU': return 'RLM PARIQUERA ACÚ';
    default: return String(raw || '').trim();
  }
}

const GENERIC_TYPES = new Set(['UNIDADE PRÓPRIA', 'TRANFERÊNCIA VOLUNTÁRIA']);

const wb = XLSX.readFile('C:/Users/afpereira/Downloads/TIPO_DESPESA.xlsx');
const ws = wb.Sheets['BASE DE DADOS'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

const buckets = new Map();
for (let i = 1; i < rows.length; i++) {
  const tipo = canonTipo(String(rows[i][0] || '').trim());
  const descNorm = norm(String(rows[i][1] || '').trim());
  if (!tipo || !descNorm) continue;
  let b = buckets.get(descNorm);
  if (!b) { b = { counts: new Map() }; buckets.set(descNorm, b); }
  b.counts.set(tipo, (b.counts.get(tipo) || 0) + 1);
}

const wins = new Map();
for (const [, b] of buckets) {
  const sorted = [...b.counts.entries()].sort((a, b) => b[1] - a[1])
    .map(([tipo, ocorrencias]) => ({ tipo, ocorrencias }));
  const specific = sorted.filter(t => !GENERIC_TYPES.has(t.tipo));
  const winner = specific.length > 0 ? specific[0].tipo : sorted[0].tipo;
  wins.set(winner, (wins.get(winner) || 0) + 1);
}

console.log('=== TYPES THAT WOULD WIN WITH "SPECIFIC BEATS GENERIC" STRATEGY ===');
const sortedWins = [...wins.entries()].sort((a, b) => b[1] - a[1]);
console.log('Total distinct types:', sortedWins.length);
sortedWins.forEach(([t, c]) => console.log(`  ${c}\t${t}`));
