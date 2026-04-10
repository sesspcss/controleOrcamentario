// Reads the DESPESAS master file, generates bd_ref entries for all unique UGs,
// fills gaps for UGs not in master, then pushes to Supabase bd_ref table.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const SUPA = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODkwNDQsImV4cCI6MjA5MTM2NTA0NH0.t3tWIh3F9lmg-a6zzdmoKpupHB9i7hTfvFmPyFbZNZs';
const hdrs = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const hdrsJson = { ...hdrs, 'Content-Type': 'application/json' };

// ─── 1. Read DESPESAS master file ───
const filePath = 'C:/Users/afpereira/Downloads/DESPESAS - 2022 - 2023 - 2024 - 2025   2026 - 31-03-26.xlsx';
const wb = XLSX.readFile(filePath);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
const hdr = rows[0];

const iDRS    = hdr.indexOf('DRS');
const iRA     = hdr.indexOf('REGIÃO ADMINISTRATIVA');
const iRRAS   = hdr.indexOf('RRAS');
const iRS     = hdr.indexOf('Região de Saúde');
const iIBGE   = hdr.indexOf('Cód IBGE');
const iMun    = hdr.indexOf('MUNICÍPIO');
const iUG     = hdr.findIndex(c => String(c).includes('Código Nome UG'));
const iFonte  = hdr.indexOf('FONTE DE RECURSOS');
const iGrupo  = hdr.indexOf('GRUPO DE DESPESA');
const iTipo   = hdr.indexOf('TIPO DE DESPESA');
const iRotulo = hdr.indexOf('RÓTULO');
const iUnid   = hdr.findIndex(c => String(c).trim().startsWith('UNIDADE'));

console.log('Header indices:', { iDRS, iRA, iRRAS, iRS, iIBGE, iMun, iUG, iFonte, iGrupo, iTipo, iRotulo, iUnid });

// Extract unique UGs from the master file
const masterUGs = {};
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r || r.every(v => v === '' || v == null)) continue;
  const ugFull = String(r[iUG] || '').trim();
  const codMatch = ugFull.match(/^(\d{6})/);
  if (!codMatch) continue;
  const cod = codMatch[1];
  if (masterUGs[cod]) continue;

  const g = idx => String(r[idx] || '').trim() || null;
  const unidadeFromUG = ugFull.replace(/^\d+\s*-\s*/, '').trim();

  masterUGs[cod] = {
    codigo:        cod,
    unidade:       unidadeFromUG,
    drs:           g(iDRS),
    regiao_ad:     g(iRA),
    rras:          String(r[iRRAS] || '').trim() || null,
    regiao_sa:     g(iRS),
    cod_ibge:      String(r[iIBGE] || '').trim() || null,
    municipio:     g(iMun),
    fonte_recurso: g(iFonte),
    grupo_despesa: g(iGrupo),
    tipo_despesa:  g(iTipo),
    rotulo:        g(iRotulo),
  };
}
console.log(`Master file UGs: ${Object.keys(masterUGs).length}`);
console.log('Codes:', Object.keys(masterUGs).sort().join(', '));

// ─── 2. Get all UG codes from lc131_despesas ───
async function getAllUGs() {
  const ugSet = new Set();
  const ugNames = {};
  const ugMunic = {};
  for (let off = 0; off < 465000; off += 10000) {
    const r = await fetch(`${SUPA}/rest/v1/lc131_despesas?select=codigo_ug,codigo_nome_ug,nome_municipio&limit=500&offset=${off}`, { headers: { ...hdrs, Accept: 'application/json' } });
    const data = await r.json();
    if (!Array.isArray(data)) { console.error('Fetch error at offset', off, ':', data); break; }
    for (const d of data) {
      const ug = String(d.codigo_ug).padStart(6, '0');
      ugSet.add(ug);
      if (!ugNames[ug] && d.codigo_nome_ug) {
        ugNames[ug] = d.codigo_nome_ug;
        ugMunic[ug] = d.nome_municipio;
      }
    }
    if (data.length < 500) break;
  }
  return { ugSet, ugNames, ugMunic };
}

// ─── 3. Get DRS/RRAS lookup from tab_drs/tab_rras ───
async function getDrsRrasLookup() {
  const drsMap = {};
  const rrasMap = {};
  
  let r = await fetch(`${SUPA}/rest/v1/tab_drs?select=*&limit=1000`, { headers: hdrs });
  for (const d of await r.json()) drsMap[d.municipio.toUpperCase()] = d.drs;
  
  r = await fetch(`${SUPA}/rest/v1/tab_rras?select=*&limit=1000`, { headers: hdrs });
  for (const d of await r.json()) rrasMap[d.municipio.toUpperCase()] = d.rras;
  
  return { drsMap, rrasMap };
}

// ─── DRS → Região Administrativa mapping ───
const DRS_TO_REGIAO_AD = {
  '01': 'SÃO PAULO',
  '02': 'ARAÇATUBA',
  '03': 'CENTRAL',
  '04': 'SANTOS',
  '05': 'BARRETOS',
  '06': 'BAURU',
  '07': 'CAMPINAS',
  '08': 'FRANCA',
  '09': 'MARÍLIA',
  '10': 'CAMPINAS',
  '11': 'PRESIDENTE PRUDENTE',
  '12': 'REGISTRO',
  '13': 'RIBEIRÃO PRETO',
  '14': 'CAMPINAS',
  '15': 'SÃO JOSÉ DO RIO PRETO',
  '16': 'SOROCABA',
  '17': 'SÃO JOSÉ DOS CAMPOS',
};

// ─── DRS → Região de Saúde default (nome da sede DRS) ───
const DRS_TO_REGIAO_SA = {
  '01': 'Sao Paulo',
  '02': 'Aracatuba',
  '03': 'Araraquara',
  '04': 'Santos',
  '05': 'Barretos',
  '06': 'Bauru',
  '07': 'Campinas',
  '08': 'Franca',
  '09': 'Marilia',
  '10': 'Piracicaba',
  '11': 'Presidente Prudente',
  '12': 'Registro',
  '13': 'Ribeirao Preto',
  '14': 'Sao Joao da Boa Vista',
  '15': 'Sao Jose do Rio Preto',
  '16': 'Sorocaba',
  '17': 'Taubate',
};

// Known IBGE codes for major SP municipalities
const IBGE_CODES = {
  'SAO PAULO': '355030',
  'CAMPINAS': '350950',
  'GUARULHOS': '351880',
  'OSASCO': '353440',
  'SANTOS': '354850',
  'RIBEIRAO PRETO': '354340',
  'SAO JOSE DO RIO PRETO': '354980',
  'SOROCABA': '355220',
  'MARILIA': '352900',
  'PRESIDENTE PRUDENTE': '354140',
  'BAURU': '350600',
  'FRANCA': '351620',
  'ARARAQUARA': '350320',
  'ARACATUBA': '350280',
  'BARRETOS': '350460',
  'REGISTRO': '354390',
  'ITU': '352240',
  'BOTUCATU': '350750',
  'CASA BRANCA': '351080',
  'FRANCO DA ROCHA': '351600',
  'MIRANDOPOLIS': '353050',
  'EMBU GUACU': '351505',
  'SAO JOAO DA BOA VISTA': '354730',
  'BADY BASSITT': '350395',
  'PIRACICABA': '353870',
  'TAUBATE': '355410',
};

function extractDrsNum(drs) {
  if (!drs) return null;
  const m = drs.match(/(\d{2})/);
  return m ? m[1] : null;
}

// ─── tipo_despesa heuristic based on UG name ───
function classifyTipoDespesa(ugName) {
  if (!ugName) return 'UNIDADE PRÓPRIA';
  const n = ugName.toUpperCase();
  // Hospitals, centers, institutes = own unit
  if (n.includes('HOSP') || n.includes('CTO.') || n.includes('CENTRO') ||
      n.includes('INST') || n.includes('FED-') || n.includes('FED -') ||
      n.includes('COMPLEXO') || n.includes('CONJUNTO HOSP') ||
      n.includes('REABILITACAO') || n.includes('REFERENCIA') ||
      n.includes('VIGILANCIA') || n.includes('GERIATRIA') ||
      n.includes('GERONTOLOG') || n.includes('CLEMENTE FERREIRA') ||
      n.includes('LAURO DE SOUZA')) {
    return 'UNIDADE PRÓPRIA';
  }
  // DRS regional departments = transfer
  if (n.includes('DEPTO.REG.SAUDE') || n.includes('DRS')) return 'TRANFERÊNCIA VOLUNTÁRIA';
  // Administrative units
  if (n.includes('GABINETE') || n.includes('COORD.') || n.includes('GRUPO DE GERENCIAMENTO') ||
      n.includes('SECR.EXECUTIVA')) return 'TRANFERÊNCIA VOLUNTÁRIA';
  // Foundations
  if (n.includes('FUND.') || n.includes('FUNDACAO') || n.includes('FESIM')) return 'UNIDADE PRÓPRIA';
  // Default
  return 'UNIDADE PRÓPRIA';
}

(async () => {
  console.log('\n--- Fetching current data ---');
  const { ugSet, ugNames, ugMunic } = await getAllUGs();
  console.log(`UGs in lc131_despesas: ${ugSet.size}`);
  
  const { drsMap, rrasMap } = await getDrsRrasLookup();
  console.log(`DRS lookup: ${Object.keys(drsMap).length} municipalities`);
  console.log(`RRAS lookup: ${Object.keys(rrasMap).length} municipalities`);

  // ─── 4. Build complete bd_ref entries ───
  const allEntries = {};
  
  // Start with master file UGs
  for (const [cod, entry] of Object.entries(masterUGs)) {
    allEntries[cod] = { ...entry };
  }
  
  // Add missing UGs from lc131 data
  for (const ug of ugSet) {
    if (allEntries[ug]) continue; // already from master
    
    const ugName = ugNames[ug] || '';
    const unidade = ugName.replace(/^\d+\s*-\s*/, '').trim();
    const municipio = (ugMunic[ug] || '').toUpperCase();
    
    // Look up DRS/RRAS from tab_drs/tab_rras by municipality
    const drs = drsMap[municipio] || null;
    const rras = rrasMap[municipio] || null;
    const drsNum = extractDrsNum(drs);
    
    allEntries[ug] = {
      codigo:        ug,
      unidade:       unidade || null,
      drs:           drs ? `DRS ${drs.split(' ')[0]} - ${drs.replace(/^\d+\s*/, '')}` : null,
      regiao_ad:     drsNum ? DRS_TO_REGIAO_AD[drsNum] || null : null,
      rras:          rras || null,
      regiao_sa:     drsNum ? DRS_TO_REGIAO_SA[drsNum] || null : null,
      cod_ibge:      IBGE_CODES[municipio] || null,
      municipio:     municipio || null,
      fonte_recurso: null,
      grupo_despesa: null,
      tipo_despesa:  classifyTipoDespesa(unidade),
      rotulo:        null,
    };
    console.log(`  Generated for UG ${ug}: ${unidade} → tipo=${allEntries[ug].tipo_despesa}, munic=${municipio}, drs=${drs}`);
  }

  const total = Object.keys(allEntries).length;
  const fromMaster = Object.keys(masterUGs).length;
  const generated = total - fromMaster;
  console.log(`\nTotal bd_ref entries: ${total} (${fromMaster} from master, ${generated} generated)`);

  // ─── 5. Delete existing bd_ref and insert all ───
  console.log('\nDeleting existing bd_ref...');
  let r = await fetch(`${SUPA}/rest/v1/bd_ref?id=gt.0`, {
    method: 'DELETE',
    headers: { ...hdrs, Prefer: 'return=minimal' }
  });
  console.log('Delete status:', r.status, await r.text());

  // Insert in chunks
  const entries = Object.values(allEntries).sort((a, b) => a.codigo.localeCompare(b.codigo));
  const CHUNK = 50;
  let inserted = 0;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    const r = await fetch(`${SUPA}/rest/v1/bd_ref`, {
      method: 'POST',
      headers: { ...hdrs, Prefer: 'return=minimal', 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk)
    });
    if (r.status >= 300) {
      const errText = await r.text();
      console.error(`Insert chunk ${i} failed: ${r.status} ${errText}`);
    } else {
      inserted += chunk.length;
    }
  }
  console.log(`Inserted ${inserted} bd_ref entries`);

  // ─── 6. Verify ───
  r = await fetch(`${SUPA}/rest/v1/bd_ref?select=codigo,tipo_despesa,unidade,regiao_ad&limit=100`, { headers: hdrs });
  const bdref = await r.json();
  console.log(`\nbd_ref now has ${bdref.length} rows:`);
  for (const row of bdref) {
    console.log(`  ${row.codigo}: tipo=${row.tipo_despesa}, unidade=${(row.unidade||'').substring(0,45)}, regiao_ad=${row.regiao_ad}`);
  }

  // ─── 7. Check coverage ───
  const bdrefCodes = new Set(bdref.map(r => r.codigo));
  const missing = [...ugSet].filter(u => !bdrefCodes.has(u));
  if (missing.length > 0) {
    console.log(`\n⚠️ Still missing UGs: ${missing.join(', ')}`);
  } else {
    console.log('\n✅ All UG codes now covered in bd_ref!');
  }
})();
