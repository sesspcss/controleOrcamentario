// REST API approach - only port 443 works through the corporate firewall
const SUPABASE_URL = 'https://odnstbeuiojohutoqvvw.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kbnN0YmV1aW9qb2h1dG9xdnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTQ1NzgsImV4cCI6MjA5MDA5MDU3OH0._71Nt-rjs3EvOuDcGcQcPFKug-iDg_dEs38UVLBLJEQ';
const HEADERS = {
  apikey: ANON_KEY,
  Authorization: `Bearer ${ANON_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
};

async function api(path, opts = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, { headers: HEADERS, ...opts });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${path.substring(0,80)} → ${text.substring(0,200)}`);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('json') ? res.json() : null;
}

async function patchBatch(filter, body) {
  return api(`lc131_despesas?${filter}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

// ──────────────── MAIN ────────────────
async function main() {
  console.log('=== Fix Fill All (via REST API) ===\n');

  // ─── 1. Normalizar strings vazias → NULL ───
  console.log('▸ 1. Strings vazias → NULL');
  for (const col of ['drs','rras','unidade','rotulo','regiao_ad','regiao_sa','municipio','cod_ibge']) {
    await patchBatch(`${col}=eq.&${col}=not.is.null`, { [col]: null });
    // Also try trimmed empty (space-only)
    await patchBatch(`${col}=eq.%20&${col}=not.is.null`, { [col]: null }).catch(() => {});
  }
  console.log('  → OK\n');

  // ─── 2. DRS ← tab_drs (grouped by DRS value) ───
  console.log('▸ 2. DRS ← tab_drs');
  const tabDrs = await api('tab_drs?select=municipio,drs');
  console.log(`  tab_drs: ${tabDrs.length} linhas`);
  // Group by DRS value
  const drsGroups = {};
  for (const r of tabDrs) {
    if (!r.drs || !r.municipio) continue;
    (drsGroups[r.drs] = drsGroups[r.drs] || []).push(r.municipio);
  }
  let drsUpdated = 0;
  for (const [drs, munis] of Object.entries(drsGroups)) {
    // PostgREST in filter: municipio=in.(val1,val2,...)
    // Batch in groups of 50 to avoid URL length limits
    for (let i = 0; i < munis.length; i += 50) {
      const batch = munis.slice(i, i + 50);
      const inList = batch.map(m => `"${m}"`).join(',');
      await patchBatch(`municipio=in.(${inList})&drs=is.null`, { drs });
      drsUpdated += batch.length;
    }
  }
  console.log(`  → ${Object.keys(drsGroups).length} DRS distintos, ${drsUpdated} municípios processados\n`);

  // ─── 3. RRAS ← tab_rras (grouped by RRAS value) ───
  console.log('▸ 3. RRAS ← tab_rras');
  const tabRras = await api('tab_rras?select=municipio,rras');
  console.log(`  tab_rras: ${tabRras.length} linhas`);
  const rrasGroups = {};
  for (const r of tabRras) {
    if (!r.rras || !r.municipio) continue;
    (rrasGroups[r.rras] = rrasGroups[r.rras] || []).push(r.municipio);
  }
  for (const [rras, munis] of Object.entries(rrasGroups)) {
    for (let i = 0; i < munis.length; i += 50) {
      const batch = munis.slice(i, i + 50);
      const inList = batch.map(m => `"${m}"`).join(',');
      await patchBatch(`municipio=in.(${inList})&rras=is.null`, { rras });
    }
  }
  console.log(`  → ${Object.keys(rrasGroups).length} RRAS distintos\n`);

  // ─── 4. bd_ref enrichment (via codigo_ug) ───
  console.log('▸ 4. bd_ref enrichment');
  const bdRef = await api('bd_ref?select=codigo,drs,unidade,regiao_ad,regiao_sa,cod_ibge,municipio');
  console.log(`  bd_ref: ${bdRef.length} linhas`);
  for (const ref of bdRef) {
    const numCode = parseInt(ref.codigo, 10);
    if (isNaN(numCode)) continue;
    // Update by codigo_ug
    const body = {};
    if (ref.drs)       body.drs       = ref.drs;
    if (ref.unidade)   body.unidade   = ref.unidade;
    if (ref.regiao_ad) body.regiao_ad = ref.regiao_ad;
    if (ref.regiao_sa) body.regiao_sa = ref.regiao_sa;
    if (ref.cod_ibge)  body.cod_ibge  = ref.cod_ibge;
    if (ref.municipio) body.municipio = ref.municipio;
    if (Object.keys(body).length === 0) continue;
    // Only update where some enrichment field is missing
    try {
      await patchBatch(`codigo_ug=eq.${numCode}&or=(unidade.is.null,drs.is.null,regiao_ad.is.null)`, body);
    } catch (e) { /* some codes may not match */ }
    // Also try codigo_projeto_atividade
    try {
      await patchBatch(`codigo_projeto_atividade=eq.${numCode}&or=(unidade.is.null,drs.is.null,regiao_ad.is.null)`, body);
    } catch (e) { /* ignore */ }
  }
  console.log(`  → ${bdRef.length} referências processadas\n`);

  // ─── 5. Rótulo (ILIKE patterns) ───
  console.log('▸ 5. Rótulo fallback');
  const categories = [
    { rotulo: 'Assistência Hospitalar', patterns: ['ambulat','hospitalar','rede*propria','bata*cinza','UNICAMP'] },
    { rotulo: 'Assistência Farmacêutica', patterns: ['farmac','medicamento'] },
    { rotulo: 'Vigilância em Saúde', patterns: ['vigil'] },
    { rotulo: 'Infraestrutura', patterns: ['aparelh','equip','reform','construc'] },
    { rotulo: 'Gestão e Administração', patterns: ['admin','conselho'] },
    { rotulo: 'Emendas Parlamentares', patterns: ['emenda'] },
    { rotulo: 'Demandas Judiciais', patterns: ['judicial','demanda*jud'] },
    { rotulo: 'Entidades Filantrópicas', patterns: ['subvenc','filantrop'] },
    { rotulo: 'Formação e Capacitação', patterns: ['resid*med','capacit'] },
    { rotulo: 'Atenção Descentralizada', patterns: ['descentraliz','prisional'] },
    { rotulo: 'Comunicação', patterns: ['publicidade'] },
  ];
  for (const cat of categories) {
    const orClauses = cat.patterns.map(p => `codigo_nome_projeto_atividade.ilike.*${p}*`).join(',');
    try {
      await patchBatch(`rotulo=is.null&or=(${orClauses})`, { rotulo: cat.rotulo });
      console.log(`  → ${cat.rotulo}`);
    } catch (e) {
      console.log(`  ✗ ${cat.rotulo}: ${e.message.substring(0,100)}`);
    }
  }
  // 'Outros' for everything else still null
  try {
    await patchBatch('rotulo=is.null', { rotulo: 'Outros' });
    console.log('  → Outros (restante)');
  } catch (e) {
    console.log(`  ✗ Outros: ${e.message.substring(0,100)}`);
  }
  console.log();

  // ─── 6. pago_total recalc (by year to avoid timeout) ───
  console.log('▸ 6. Recalcular pago_total (por ano)');
  let totalFixed = 0;
  for (const yr of [2022, 2023, 2024, 2025, 2026]) {
    let offset = 0;
    while (true) {
      let rows;
      try {
        rows = await api(
          `lc131_despesas?select=id,pago,pago_anos_anteriores,pago_total&pago_total=is.null&exercicio=eq.${yr}&limit=500&offset=${offset}`
        );
      } catch (e) {
        console.log(`  ✗ ${yr}: ${e.message.substring(0, 80)}`);
        break;
      }
      if (!rows || rows.length === 0) break;
      for (const r of rows) {
        const expected = (r.pago || 0) + (r.pago_anos_anteriores || 0);
        try {
          await patchBatch(`id=eq.${r.id}`, { pago_total: expected });
          totalFixed++;
        } catch (e) { /* ignore */ }
      }
      offset += rows.length;
      process.stdout.write(`  ${yr}: ${offset} linhas...\r`);
    }
    console.log(`  ${yr}: processado`);
  }
  console.log(`  → ${totalFixed} linhas de pago_total corrigidas\n`);

  // ─── 7. Verificação ───
  console.log('▸ 7. Verificação final');
  // Count via HEAD requests with Prefer: count=exact
  const countHeaders = { ...HEADERS, Prefer: 'count=exact' };
  for (const col of ['drs','rras','unidade','rotulo','municipio','regiao_ad','regiao_sa','cod_ibge']) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/lc131_despesas?${col}=not.is.null&select=id&limit=0`, {
      headers: countHeaders,
    });
    const range = res.headers.get('content-range') || '';
    const total = range.split('/')[1] || '?';
    console.log(`  ${col.padEnd(12)}: ${total}`);
  }
  // Total count
  const resTotal = await fetch(`${SUPABASE_URL}/rest/v1/lc131_despesas?select=id&limit=0`, {
    headers: countHeaders,
  });
  const rangeTotal = resTotal.headers.get('content-range') || '';
  console.log(`  ${'TOTAL'.padEnd(12)}: ${rangeTotal.split('/')[1] || '?'}`);
  
  console.log('\n✔ Concluído!');
}

main().catch(e => { console.error(e); process.exit(1); });
