#!/usr/bin/env node
// run-fix-all-v2.mjs — Preenche TODAS as colunas vazias via REST API
// Firewall corporativo bloqueia PostgreSQL; apenas HTTPS/443 funciona.

const URL = 'https://odnstbeuiojohutoqvvw.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kbnN0YmV1aW9qb2h1dG9xdnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTQ1NzgsImV4cCI6MjA5MDA5MDU3OH0._71Nt-rjs3EvOuDcGcQcPFKug-iDg_dEs38UVLBLJEQ';
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' };

/* ─── helpers ─────────────────────────────────────────────── */

async function get(path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${r.status} ${path.slice(0,80)}: ${(await r.text()).slice(0,200)}`);
  return r.json();
}

async function pat(filter, body) {
  const r = await fetch(`${URL}/rest/v1/lc131_despesas?${filter}`, {
    method: 'PATCH', headers: H, body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`PATCH ${r.status} ${filter.slice(0,60)}: ${t.slice(0,200)}`);
  }
}

async function cnt(col) {
  const r = await fetch(
    `${URL}/rest/v1/lc131_despesas?select=id&limit=0&${col}=not.is.null`,
    { headers: { ...H, Prefer: 'count=exact' } }
  );
  if (!r.ok) return `ERR-${r.status}`;
  const rng = r.headers.get('content-range') || '';
  return rng.split('/')[1] || '?';
}

async function cntTotal() {
  const r = await fetch(
    `${URL}/rest/v1/lc131_despesas?select=id&limit=0`,
    { headers: { ...H, Prefer: 'count=exact' } }
  );
  if (!r.ok) return `ERR-${r.status}`;
  return (r.headers.get('content-range') || '').split('/')[1] || '?';
}

async function verify(label) {
  console.log(`\n── ${label} ──`);
  const cols = ['drs','rras','unidade','rotulo','municipio','regiao_ad','regiao_sa','cod_ibge','pago_total'];
  for (const c of cols) {
    const n = await cnt(c);
    console.log(`  ${c.padEnd(14)}: ${n}`);
  }
  console.log(`  ${'TOTAL'.padEnd(14)}: ${await cntTotal()}`);
}

/* ─── main ────────────────────────────────────────────────── */

async function main() {
  console.log('=== Fix All v2 ===\n');

  // ── 0. Pre-check: verificar acesso e colunas ──
  console.log('▸ 0. Pre-check');
  let sample;
  try {
    sample = await get('lc131_despesas?select=*&limit=1');
    const keys = Object.keys(sample[0] || {});
    console.log(`  Colunas (${keys.length}): ${keys.join(', ')}`);
  } catch (e) {
    console.error('  FATAL: não consegue acessar lc131_despesas:', e.message);
    process.exit(1);
  }

  // Verificar tabelas de referência
  let tabDrs, tabRras, bdRef;
  try {
    tabDrs = await get('tab_drs?select=municipio,drs');
    console.log(`  tab_drs: ${tabDrs.length} linhas`);
  } catch (e) { console.log(`  tab_drs: ERRO - ${e.message}`); tabDrs = []; }
  try {
    tabRras = await get('tab_rras?select=municipio,rras');
    console.log(`  tab_rras: ${tabRras.length} linhas`);
  } catch (e) { console.log(`  tab_rras: ERRO - ${e.message}`); tabRras = []; }
  try {
    bdRef = await get('bd_ref?select=codigo,drs,unidade,regiao_ad,regiao_sa,cod_ibge,municipio');
    console.log(`  bd_ref: ${bdRef.length} linhas`);
  } catch (e) { console.log(`  bd_ref: ERRO - ${e.message}`); bdRef = []; }

  // ── 1. Estado atual ──
  await verify('Estado ANTES');

  // ── 2. Strings vazias → NULL ──
  console.log('\n▸ 2. Strings vazias → NULL');
  for (const col of ['drs','rras','unidade','rotulo','regiao_ad','regiao_sa','municipio','cod_ibge']) {
    try { await pat(`${col}=eq.&${col}=not.is.null`, { [col]: null }); }
    catch (e) { console.log(`  ✗ ${col}: ${e.message.slice(0,80)}`); }
  }
  console.log('  OK');

  // ── 3. DRS ← tab_drs (reforçar, caso reste algum NULL) ──
  console.log('\n▸ 3. DRS ← tab_drs');
  if (tabDrs.length > 0) {
    const groups = {};
    for (const r of tabDrs) {
      if (r.drs && r.municipio) (groups[r.drs] = groups[r.drs] || []).push(r.municipio);
    }
    let n = 0;
    for (const [drs, munis] of Object.entries(groups)) {
      for (let i = 0; i < munis.length; i += 30) {
        const batch = munis.slice(i, i + 30);
        const inList = batch.map(m => `"${m}"`).join(',');
        try {
          await pat(`municipio=in.(${inList})&drs=is.null`, { drs });
          n += batch.length;
        } catch (e) {
          // fallback individual
          for (const m of batch) {
            try { await pat(`municipio=eq.${m}&drs=is.null`, { drs }); n++; }
            catch (_) {}
          }
        }
      }
    }
    console.log(`  → ${Object.keys(groups).length} DRS, ${n} munic processados`);
  }

  // ── 4. RRAS ← tab_rras ──
  console.log('\n▸ 4. RRAS ← tab_rras');
  if (tabRras.length > 0) {
    // Log sample to debug
    console.log(`  Amostra tab_rras[0]: ${JSON.stringify(tabRras[0])}`);
    const groups = {};
    for (const r of tabRras) {
      if (r.rras && r.municipio) (groups[r.rras] = groups[r.rras] || []).push(r.municipio);
    }
    console.log(`  ${Object.keys(groups).length} RRAS distintos`);
    let n = 0, errs = 0;
    for (const [rras, munis] of Object.entries(groups)) {
      for (let i = 0; i < munis.length; i += 30) {
        const batch = munis.slice(i, i + 30);
        const inList = batch.map(m => `"${m}"`).join(',');
        try {
          await pat(`municipio=in.(${inList})&rras=is.null`, { rras });
          n += batch.length;
        } catch (e) {
          // fallback individual
          for (const m of batch) {
            try { await pat(`municipio=eq.${m}&rras=is.null`, { rras }); n++; }
            catch (e2) {
              if (errs < 3) console.log(`  ✗ rras ${m}: ${e2.message.slice(0,80)}`);
              errs++;
            }
          }
        }
      }
    }
    if (errs > 3) console.log(`  ... e mais ${errs - 3} erros`);
    console.log(`  → ${n} munic processados`);
  }

  // ── 5. bd_ref enrichment ──
  console.log('\n▸ 5. bd_ref enrichment');
  if (bdRef.length > 0) {
    console.log(`  Amostra bd_ref[0]: ${JSON.stringify(bdRef[0])}`);
    let ok = 0, fail = 0;
    for (const ref of bdRef) {
      const numCode = parseInt(ref.codigo, 10);
      if (isNaN(numCode)) { fail++; continue; }

      const body = {};
      if (ref.unidade)   body.unidade   = ref.unidade;
      if (ref.regiao_ad) body.regiao_ad = ref.regiao_ad;
      if (ref.regiao_sa) body.regiao_sa = ref.regiao_sa;
      if (ref.cod_ibge)  body.cod_ibge  = ref.cod_ibge;
      if (ref.drs)       body.drs       = ref.drs;
      if (ref.municipio) body.municipio = ref.municipio;
      if (Object.keys(body).length === 0) continue;

      // Match by codigo_ug (integer comparison)
      try {
        await pat(`codigo_ug=eq.${numCode}&unidade=is.null`, body);
        ok++;
      } catch (e) {
        if (fail < 3) console.log(`  ✗ ug=${numCode}: ${e.message.slice(0,80)}`);
        fail++;
      }

      // Also match by codigo_projeto_atividade
      try {
        await pat(`codigo_projeto_atividade=eq.${numCode}&unidade=is.null`, body);
      } catch (_) {}
    }
    if (fail > 3) console.log(`  ... e mais ${fail - 3} erros`);
    console.log(`  → OK: ${ok}, Fail: ${fail}`);
  }

  // ── 6. Rótulo (individual ILIKE patterns) ──
  console.log('\n▸ 6. Rótulo');
  const cats = [
    ['Assistência Hospitalar',     ['*ambulat*', '*hospitalar*', '*rede*propria*', '*bata*cinza*', '*UNICAMP*']],
    ['Assistência Farmacêutica',   ['*farmac*', '*medicamento*']],
    ['Vigilância em Saúde',        ['*vigil*']],
    ['Infraestrutura',             ['*aparelh*', '*equip*', '*reform*', '*construc*']],
    ['Gestão e Administração',     ['*admin*', '*conselho*']],
    ['Emendas Parlamentares',      ['*emenda*']],
    ['Demandas Judiciais',         ['*judicial*', '*demanda*jud*']],
    ['Entidades Filantrópicas',    ['*subvenc*', '*filantrop*']],
    ['Formação e Capacitação',     ['*resid*med*', '*capacit*']],
    ['Atenção Descentralizada',    ['*descentraliz*', '*prisional*']],
    ['Comunicação',                ['*publicidade*']],
  ];
  for (const [rotulo, patterns] of cats) {
    let ok = true;
    for (const p of patterns) {
      try {
        await pat(`rotulo=is.null&codigo_nome_projeto_atividade=ilike.${p}`, { rotulo });
      } catch (e) {
        ok = false;
        console.log(`  ✗ ${rotulo} [${p}]: ${e.message.slice(0,80)}`);
      }
    }
    if (ok) console.log(`  → ${rotulo}`);
  }
  // Fallback: Outros
  try {
    await pat('rotulo=is.null', { rotulo: 'Outros' });
    console.log('  → Outros (restante)');
  } catch (e) {
    console.log(`  ✗ Outros: ${e.message.slice(0,80)}`);
  }

  // ── 7. pago_total (buscar apenas NULLs, por ano, batch) ──
  console.log('\n▸ 7. pago_total');
  let ptFixed = 0;
  for (const yr of [2022, 2023, 2024, 2025, 2026]) {
    let offset = 0, yrFixed = 0;
    while (true) {
      let rows;
      try {
        rows = await get(
          `lc131_despesas?select=id,pago,pago_anos_anteriores&pago_total=is.null&exercicio=eq.${yr}&limit=500&offset=${offset}`
        );
      } catch (e) {
        console.log(`  ✗ ${yr} offset=${offset}: ${e.message.slice(0,80)}`);
        break;
      }
      if (!rows || rows.length === 0) break;

      // Batch: group by same pago_total value and patch together? No — each row has different values.
      // Use Promise.allSettled for parallelism (5 at a time)
      for (let i = 0; i < rows.length; i += 5) {
        const chunk = rows.slice(i, i + 5);
        const results = await Promise.allSettled(
          chunk.map(r => {
            const val = (r.pago || 0) + (r.pago_anos_anteriores || 0);
            return pat(`id=eq.${r.id}`, { pago_total: val });
          })
        );
        ptFixed += results.filter(r => r.status === 'fulfilled').length;
        yrFixed += results.filter(r => r.status === 'fulfilled').length;
      }

      offset += rows.length;
      if (rows.length < 500) break;
    }
    if (yrFixed > 0) console.log(`  ${yr}: ${yrFixed} linhas`);
  }
  console.log(`  → Total: ${ptFixed} linhas corrigidas`);

  // ── 8. Verificação final ──
  await verify('Estado DEPOIS');

  console.log('\n✔ Concluído!');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
