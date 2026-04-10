#!/usr/bin/env node
// quick-verify.mjs — Verificar se as colunas foram preenchidas + corrigir pago_total

const URL = 'https://odnstbeuiojohutoqvvw.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kbnN0YmV1aW9qb2h1dG9xdnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTQ1NzgsImV4cCI6MjA5MDA5MDU3OH0._71Nt-rjs3EvOuDcGcQcPFKug-iDg_dEs38UVLBLJEQ';
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' };

async function get(path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${r.status} ${path.slice(0,80)}: ${(await r.text()).slice(0,200)}`);
  return r.json();
}

async function pat(filter, body) {
  const r = await fetch(`${URL}/rest/v1/lc131_despesas?${filter}`, {
    method: 'PATCH', headers: H, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PATCH ${r.status}: ${(await r.text()).slice(0,200)}`);
}

async function main() {
  console.log('=== Quick Verify + Fix pago_total ===\n');

  // ── 1. Buscar 10 linhas com diferentes municípios e verificar colunas ──
  console.log('▸ 1. Amostra de dados (10 linhas)');
  const samples = await get(
    'lc131_despesas?select=id,municipio,drs,rras,unidade,rotulo,regiao_ad,regiao_sa,cod_ibge,pago,pago_anos_anteriores,pago_total,ano_referencia&limit=10&municipio=not.is.null'
  );
  for (const r of samples) {
    console.log(`  id=${r.id} mun=${r.municipio} drs=${r.drs||'NULL'} rras=${r.rras||'NULL'} uni=${r.unidade||'NULL'} rot=${(r.rotulo||'NULL').slice(0,15)} reg=${r.regiao_ad||'NULL'} ibge=${r.cod_ibge||'NULL'} pt=${r.pago_total}`);
  }

  // ── 2. Contar por amostragem rápida: buscar 1 linha onde coluna IS NOT NULL ──
  console.log('\n▸ 2. Verificação rápida (existe pelo menos 1 ?):');
  const cols = ['drs','rras','unidade','rotulo','regiao_ad','regiao_sa','cod_ibge','pago_total'];
  for (const col of cols) {
    try {
      const rows = await get(`lc131_despesas?select=id&${col}=not.is.null&limit=1`);
      console.log(`  ${col.padEnd(14)}: ${rows.length > 0 ? '✓ TEM dados' : '✗ VAZIO (0 linhas)'}`);
    } catch (e) {
      console.log(`  ${col.padEnd(14)}: ERR - ${e.message.slice(0,80)}`);
    }
  }

  // ── 3. Contar NULLs (inverso: quantos faltam?) — filtrar por ano pra evitar timeout ──
  console.log('\n▸ 3. Contagem NULL por ano:');
  const cH = { ...H, Prefer: 'count=exact' };
  for (const yr of [2022, 2023, 2024, 2025, 2026]) {
    const results = {};
    for (const col of ['drs','rras','unidade','rotulo']) {
      try {
        const r = await fetch(
          `${URL}/rest/v1/lc131_despesas?select=id&limit=0&${col}=is.null&ano_referencia=eq.${yr}`,
          { headers: cH }
        );
        if (r.ok) {
          const rng = r.headers.get('content-range') || '';
          results[col] = rng.split('/')[1] || '?';
        } else {
          results[col] = `E${r.status}`;
        }
      } catch (e) { results[col] = 'ERR'; }
    }
    console.log(`  ${yr}: drs_null=${results.drs} rras_null=${results.rras} uni_null=${results.unidade} rot_null=${results.rotulo}`);
  }

  // ── 4. Fix pago_total (usando ano_referencia, não exercicio) ──
  console.log('\n▸ 4. pago_total');
  let ptFixed = 0;
  for (const yr of [2022, 2023, 2024, 2025, 2026]) {
    let offset = 0, yrFixed = 0;
    while (true) {
      let rows;
      try {
        rows = await get(
          `lc131_despesas?select=id,pago,pago_anos_anteriores&pago_total=is.null&ano_referencia=eq.${yr}&limit=500&offset=${offset}`
        );
      } catch (e) {
        console.log(`  ✗ ${yr}: ${e.message.slice(0,80)}`);
        break;
      }
      if (!rows || rows.length === 0) break;

      // parallel 5 at a time
      for (let i = 0; i < rows.length; i += 10) {
        const chunk = rows.slice(i, i + 10);
        const results = await Promise.allSettled(
          chunk.map(r => {
            const val = (r.pago || 0) + (r.pago_anos_anteriores || 0);
            return pat(`id=eq.${r.id}`, { pago_total: val });
          })
        );
        const ok = results.filter(r => r.status === 'fulfilled').length;
        ptFixed += ok;
        yrFixed += ok;
      }

      offset += rows.length;
      if (rows.length < 500) break;
      process.stdout.write(`  ${yr}: ${yrFixed}...\r`);
    }
    if (yrFixed > 0) console.log(`  ${yr}: ${yrFixed} linhas`);
    else console.log(`  ${yr}: 0 (já calculado ou vazio)`);
  }
  console.log(`  → Total pago_total: ${ptFixed}`);

  // ── 5. Amostra final ──
  console.log('\n▸ 5. Amostra final (5 linhas)');
  const final = await get(
    'lc131_despesas?select=id,municipio,drs,rras,unidade,rotulo,pago_total&limit=5&municipio=not.is.null'
  );
  for (const r of final) {
    console.log(`  id=${r.id} mun=${r.municipio} drs=${r.drs||'NULL'} rras=${r.rras||'NULL'} uni=${r.unidade||'NULL'} rot=${(r.rotulo||'NULL').slice(0,20)} pt=${r.pago_total}`);
  }

  console.log('\n✔ Concluído!');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
