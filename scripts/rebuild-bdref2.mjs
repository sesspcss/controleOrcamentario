// Simplified: Read master file → truncate bd_ref → insert all 100 UGs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const SUPA = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODkwNDQsImV4cCI6MjA5MTM2NTA0NH0.t3tWIh3F9lmg-a6zzdmoKpupHB9i7hTfvFmPyFbZNZs';
const hdrs = { apikey: KEY, Authorization: `Bearer ${KEY}` };

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

// Extract unique UGs
const masterUGs = {};
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r || r.every(v => v === '' || v == null)) continue;
  const ugFull = String(r[iUG] || '').trim();
  const codMatch = ugFull.match(/^(\d{6})/);
  if (!codMatch) continue;
  const cod = codMatch[1];
  if (masterUGs[cod]) continue;

  const g = idx => { const v = String(r[idx] || '').trim(); return v || null; };

  masterUGs[cod] = {
    codigo:        cod,
    unidade:       ugFull.replace(/^\d+\s*-\s*/, '').trim(),
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

const entries = Object.values(masterUGs).sort((a, b) => a.codigo.localeCompare(b.codigo));
console.log(`Extracted ${entries.length} unique UGs from master file`);

// Show sample
entries.slice(0, 5).forEach(e =>
  console.log(`  ${e.codigo}: tipo=${e.tipo_despesa}, regiao_ad=${e.regiao_ad}, regiao_sa=${e.regiao_sa}, ibge=${e.cod_ibge}`)
);

(async () => {
  // ─── 2. Delete ALL existing bd_ref rows ───
  // Use neq filter with impossible value to match all rows
  console.log('\nDeleting all bd_ref rows...');
  const delR = await fetch(`${SUPA}/rest/v1/bd_ref?codigo=neq.IMPOSSIBLE_VALUE`, {
    method: 'DELETE',
    headers: { ...hdrs, Prefer: 'return=representation' }
  });
  const deleted = await delR.json();
  console.log(`Deleted ${Array.isArray(deleted) ? deleted.length : '?'} rows (status: ${delR.status})`);

  // ─── 3. Insert all entries ───
  const CHUNK = 30;
  let inserted = 0;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    const r = await fetch(`${SUPA}/rest/v1/bd_ref?on_conflict=codigo`, {
      method: 'POST',
      headers: { ...hdrs, 'Content-Type': 'application/json', Prefer: 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify(chunk)
    });
    if (r.status >= 300) {
      const errText = await r.text();
      console.error(`Insert chunk ${Math.floor(i/CHUNK)} failed (status ${r.status}): ${errText.substring(0, 200)}`);
    } else {
      inserted += chunk.length;
      process.stdout.write(`\rInserted ${inserted}/${entries.length}...`);
    }
  }
  console.log(`\nInserted ${inserted} bd_ref entries total`);

  // ─── 4. Verify ───
  const vR = await fetch(`${SUPA}/rest/v1/bd_ref?select=codigo,tipo_despesa,regiao_ad,regiao_sa,cod_ibge,unidade&order=codigo&limit=200`, { headers: hdrs });
  const bdref = await vR.json();
  console.log(`\nbd_ref now has ${bdref.length} rows.`);

  // Show a sample of important fields
  let nullTipo = 0, nullRA = 0, nullRS = 0, nullIBGE = 0;
  for (const r of bdref) {
    if (!r.tipo_despesa) nullTipo++;
    if (!r.regiao_ad) nullRA++;
    if (!r.regiao_sa) nullRS++;
    if (!r.cod_ibge) nullIBGE++;
  }
  console.log(`  tipo_despesa NULL: ${nullTipo}/${bdref.length}`);
  console.log(`  regiao_ad NULL: ${nullRA}/${bdref.length}`);
  console.log(`  regiao_sa NULL: ${nullRS}/${bdref.length}`);
  console.log(`  cod_ibge NULL: ${nullIBGE}/${bdref.length}`);

  // Show first 10 and last 5
  console.log('\nFirst 10:');
  bdref.slice(0, 10).forEach(r =>
    console.log(`  ${r.codigo}: tipo=${r.tipo_despesa||'NULL'}, ra=${r.regiao_ad||'NULL'}, rs=${r.regiao_sa||'NULL'}, ibge=${r.cod_ibge||'NULL'}, un=${(r.unidade||'NULL').substring(0,40)}`)
  );
  console.log('Last 5:');
  bdref.slice(-5).forEach(r =>
    console.log(`  ${r.codigo}: tipo=${r.tipo_despesa||'NULL'}, ra=${r.regiao_ad||'NULL'}, rs=${r.regiao_sa||'NULL'}, ibge=${r.cod_ibge||'NULL'}, un=${(r.unidade||'NULL').substring(0,40)}`)
  );
})();
