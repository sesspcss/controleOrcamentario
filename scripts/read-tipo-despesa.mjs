import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const wb = XLSX.readFile('C:/Users/afpereira/Downloads/TIPO_DESPESA.xlsx');
const ws = wb.Sheets['BASE DE DADOS'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

// Collect all distinct descricao per tipo
const tipoDescs = new Map();
for (let i = 1; i < rows.length; i++) {
  const tipo = String(rows[i][0] || '').trim();
  const desc = String(rows[i][1] || '').trim();
  if (!tipo) continue;
  if (!tipoDescs.has(tipo)) tipoDescs.set(tipo, new Set());
  if (desc) tipoDescs.get(tipo).add(desc);
}

// Focus on specific tipos that are NOT fallback (TRANFERÊNCIA/UNIDADE PROPRIA)
const focus = [
  'DOSE CERTA','GLICEMIA','QUALIS MAIS','REPELENTE','SORRIA SP','IGM SUS PAULISTA',
  'TABELA SUS PAULISTA','TABELASUS PAULISTA','ATENÇÃO BÁSICA',
  'INTRAORÇAMENTÁRIA','INTRAORÇAMENTÁRIA - BATA CINZA PPP',
  'SISTEMA PRISIONAL','RESIDÊNCIA TERAPÊUTICA',
  'RLM BOTUCATU','RLM CAMPINAS','RLM DIADEMA','RLM FERNANDOPOLIS','RLM FERNANDÓPOLIS',
  'RLM MARILIA','RLM MOGI MIRIM','RLM PARIQUERA ACú','RLM PRESIDENTE PRUDENTE',
  'RLM SANTOS','RLM SAO JOSE DO RIO PRETO','RLM SÃO JOSÉ DOS CAMPOS','RLM SOROCABA','RLM TAUBATE',
  'REDE LUCY MONTORO','PISO ENFERMAGEM','PISO DA ENFERMAGEM',
  'EMENDAS','EMENDA','FUNDO A FUNDO - EMENDA','FUNDO A FUNDO - DEMANDAS PARLAMENTARES',
  'FUNDO A FUNDO PAB','CASAS DE APOIO','PPP','TEA','CONTRATO GESTÃO',
  'AEDES AEGYPTI','CIRURGIAS ELETIVAS','DIVIDA EXTERNA E INTERNA',
  'AÇÃO CIVIL - BAURU'
];

for (const tipo of focus) {
  const descs = tipoDescs.get(tipo);
  if (!descs) { console.log(`\nTIPO "${tipo}": NOT FOUND`); continue; }
  console.log(`\nTIPO: "${tipo}" (${descs.size} descs):`);
  for (const d of descs) console.log(`  - ${d}`);
}
