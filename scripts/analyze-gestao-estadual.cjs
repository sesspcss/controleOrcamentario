// analyze-gestao-estadual.cjs
// Shows which descriptions belong to missing types vs TRANFERÊNCIA VOLUNTÁRIA

const XLSX = require('xlsx');

function norm(v) {
  return String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();
}

function canonTipo(raw) {
  const n = norm(raw);
  switch (n) {
    case 'EMENDAS':           return 'EMENDA';
    case 'GESTAO ESTADUAL':   return 'GESTÃO ESTADUAL';
    case 'TABELASUS PAULISTA': return 'TABELA SUS PAULISTA';
    case 'PISO DA ENFERMAGEM': return 'PISO ENFERMAGEM';
    default: return String(raw || '').trim();
  }
}

const wb = XLSX.readFile('C:/Users/afpereira/Downloads/TIPO_DESPESA.xlsx');
const ws = wb.Sheets['BASE DE DADOS'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
const tipoIdx = 0, descIdx = 1;

// Build per-description freq map
const buckets = new Map();
for (let i = 1; i < rows.length; i++) {
  const rawTipo = String(rows[i][tipoIdx] || '').trim();
  const rawDesc = String(rows[i][descIdx] || '').trim();
  if (!rawTipo || !rawDesc) continue;
  const tipo = canonTipo(rawTipo);
  const descNorm = norm(rawDesc);
  let b = buckets.get(descNorm);
  if (!b) { b = { counts: new Map(), sample: rawDesc }; buckets.set(descNorm, b); }
  b.counts.set(tipo, (b.counts.get(tipo) || 0) + 1);
}

// After majority-vote, what types survive?
const survives = new Map(); // tipo -> count of descriptions it wins
const loses = new Map();    // tipo -> count of descriptions it loses

for (const [desc, b] of buckets) {
  const sorted = [...b.counts.entries()].sort((a, b) => b[1] - a[1]);
  const winner = sorted[0][0];
  survives.set(winner, (survives.get(winner) || 0) + 1);
  // Track losers
  for (let i = 1; i < sorted.length; i++) {
    const loser = sorted[i][0];
    loses.set(loser, (loses.get(loser) || 0) + 1);
  }
}

console.log('=== TYPES THAT WIN DESCRIPTIONS (will appear in dashboard) ===');
const winSorted = [...survives.entries()].sort((a, b) => b[1] - a[1]);
winSorted.forEach(([t, c]) => console.log(`  ${c}\t${t}`));

console.log('\n=== TYPES THAT NEVER WIN (lost to majority vote, WON\'T appear) ===');
const allTypes = new Set([...survives.keys(), ...loses.keys()]);
const neverWin = [];
for (const t of allTypes) {
  if (!survives.has(t)) neverWin.push([t, loses.get(t) || 0]);
}
neverWin.sort((a, b) => b[1] - a[1]);
neverWin.forEach(([t, c]) => console.log(`  loses ${c} descriptions: ${t}`));

console.log('\n=== DESCRIPTIONS ABSORBED FROM GESTÃO ESTADUAL (sample) ===');
let ge_shown = 0;
for (const [desc, b] of buckets) {
  const sorted = [...b.counts.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted[0][0] !== 'GESTÃO ESTADUAL' && b.counts.has('GESTÃO ESTADUAL')) {
    if (ge_shown < 10) console.log(`  "${b.sample}" → winner:${sorted[0][0]}(${sorted[0][1]}) vs GESTÃO ESTADUAL(${b.counts.get('GESTÃO ESTADUAL')})`);
    ge_shown++;
  }
}
if (ge_shown === 0) console.log('  (none found - GESTÃO ESTADUAL wins all its descriptions)');
console.log(`  Total absorbed: ${ge_shown}`);

console.log('\n=== UNAMBIGUOUS DESCRIPTIONS PER TYPE (would survive strict filter) ===');
const strict = new Map();
for (const [desc, b] of buckets) {
  if (b.counts.size === 1) {
    const tipo = [...b.counts.keys()][0];
    strict.set(tipo, (strict.get(tipo) || 0) + 1);
  }
}
const strictSorted = [...strict.entries()].sort((a, b) => b[1] - a[1]);
strictSorted.forEach(([t, c]) => console.log(`  ${c}\t${t}`));
