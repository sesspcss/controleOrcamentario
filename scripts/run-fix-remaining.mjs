// Re-run only the failed steps: rotulo fix (with corrected patterns) + pago_total + verification
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
    throw new Error(`${res.status} ${path.substring(0,60)} → ${text.substring(0,200)}`);
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

async function main() {
  console.log('=== Fix: Rótulo + pago_total + Verificação ===\n');

  // ─── 5. Rótulo (fix failed categories) ───
  console.log('▸ 5. Rótulo - categorias que falharam');
  // These use * (PostgREST wildcard = SQL %) instead of literal %
  const failedCategories = [
    { rotulo: 'Assistência Hospitalar', patterns: ['ambulat','hospitalar','rede*propria','bata*cinza','UNICAMP'] },
    { rotulo: 'Demandas Judiciais', patterns: ['judicial','demanda*jud'] },
    { rotulo: 'Formação e Capacitação', patterns: ['resid*med','capacit'] },
  ];
  for (const cat of failedCategories) {
    const orClauses = cat.patterns.map(p => `codigo_nome_projeto_atividade.ilike.*${p}*`).join(',');
    try {
      await patchBatch(`rotulo=is.null&or=(${orClauses})`, { rotulo: cat.rotulo });
      console.log(`  → ${cat.rotulo}`);
    } catch (e) {
      // If or() still fails, try each pattern individually
      console.log(`  ⚠ ${cat.rotulo} (or falhou, tentando individual...)`);
      for (const p of cat.patterns) {
        try {
          await patchBatch(`rotulo=is.null&codigo_nome_projeto_atividade=ilike.*${p}*`, { rotulo: cat.rotulo });
          console.log(`    → *${p}*`);
        } catch (e2) {
          console.log(`    ✗ *${p}*: ${e2.message.substring(0, 80)}`);
        }
      }
    }
  }
  console.log();

  // ─── 6. pago_total (by year, small batches) ───
  console.log('▸ 6. Recalcular pago_total (por ano)');
  let totalFixed = 0;
  for (const yr of [2022, 2023, 2024, 2025, 2026]) {
    let offset = 0;
    let yearFixed = 0;
    while (true) {
      let rows;
      try {
        rows = await api(
          `lc131_despesas?select=id,pago,pago_anos_anteriores,pago_total&pago_total=is.null&exercicio=eq.${yr}&limit=200&offset=${offset}`
        );
      } catch (e) {
        console.log(`  ✗ ${yr} offset=${offset}: ${e.message.substring(0, 80)}`);
        break;
      }
      if (!rows || rows.length === 0) break;
      for (const r of rows) {
        const expected = (r.pago || 0) + (r.pago_anos_anteriores || 0);
        try {
          await patchBatch(`id=eq.${r.id}`, { pago_total: expected });
          totalFixed++;
          yearFixed++;
        } catch (e) { /* ignore */ }
      }
      offset += rows.length;
      process.stdout.write(`  ${yr}: ${yearFixed} linhas...\r`);
    }
    console.log(`  ${yr}: ${yearFixed} linhas corrigidas`);
  }
  console.log(`  → Total: ${totalFixed} linhas de pago_total\n`);

  // ─── 7. Verificação ───
  console.log('▸ 7. Verificação final');
  const countHeaders = { ...HEADERS, Prefer: 'count=exact' };
  for (const col of ['drs','rras','unidade','rotulo','municipio','regiao_ad','regiao_sa','cod_ibge']) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/lc131_despesas?${col}=not.is.null&select=id&limit=0`, {
      headers: countHeaders,
    });
    const range = res.headers.get('content-range') || '';
    const total = range.split('/')[1] || '?';
    console.log(`  ${col.padEnd(12)}: ${total}`);
  }
  const resTotal = await fetch(`${SUPABASE_URL}/rest/v1/lc131_despesas?select=id&limit=0`, {
    headers: countHeaders,
  });
  const rangeTotal = resTotal.headers.get('content-range') || '';
  console.log(`  ${'TOTAL'.padEnd(12)}: ${rangeTotal.split('/')[1] || '?'}`);
  
  console.log('\n✔ Concluído!');
}

main().catch(e => { console.error(e); process.exit(1); });
