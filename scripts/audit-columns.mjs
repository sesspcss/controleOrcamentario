const url = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODkwNDQsImV4cCI6MjA5MTM2NTA0NH0.t3tWIh3F9lmg-a6zzdmoKpupHB9i7hTfvFmPyFbZNZs';
const h = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };

async function countNonNull(col) {
  const r = await fetch(`${url}/rest/v1/lc131_despesas?select=id&${col}=not.is.null&${col}=neq.&limit=0`, {
    headers: { ...h, Prefer: 'count=exact', Range: '0-0' }
  });
  const range = r.headers.get('content-range');
  // content-range: 0-0/12345 or */0
  if (!range) return '?';
  const m = range.match(/\/(\d+)/);
  return m ? parseInt(m[1]) : '?';
}

async function countTotal() {
  const r = await fetch(`${url}/rest/v1/lc131_despesas?select=id&limit=0`, {
    headers: { ...h, Prefer: 'count=exact', Range: '0-0' }
  });
  const range = r.headers.get('content-range');
  const m = range?.match(/\/(\d+)/);
  return m ? parseInt(m[1]) : '?';
}

(async () => {
  const total = await countTotal();
  console.log(`Total rows: ${total}\n`);

  const cols = [
    'ano_referencia', 'nome_municipio', 'municipio',
    'codigo_nome_uo', 'codigo_ug', 'codigo_nome_ug',
    'codigo_projeto_atividade', 'codigo_nome_projeto_atividade',
    'codigo_nome_fonte_recurso', 'codigo_fonte_recursos', 'fonte_recurso',
    'codigo_nome_grupo', 'grupo_despesa',
    'codigo_nome_elemento', 'codigo_elemento',
    'codigo_nome_favorecido', 'codigo_favorecido',
    'descricao_processo', 'numero_processo',
    'empenhado', 'liquidado', 'pago', 'pago_anos_anteriores', 'pago_total',
    'drs', 'regiao_ad', 'rras', 'regiao_sa', 'cod_ibge',
    'unidade', 'rotulo', 'tipo_despesa'
  ];

  console.log('Column                           | Non-null/non-empty | Status');
  console.log('-'.repeat(75));
  
  for (const col of cols) {
    const count = await countNonNull(col);
    const pct = typeof count === 'number' ? ((count / total) * 100).toFixed(1) : '?';
    const status = count === 0 ? '❌ EMPTY' : count === total ? '✅ FULL' : `⚠️  ${pct}%`;
    console.log(`${col.padEnd(35)}| ${String(count).padEnd(19)}| ${status}`);
  }

  // Also check sample of enriched data
  console.log('\n\n=== Sample row (first enriched) ===');
  const r = await fetch(`${url}/rest/v1/lc131_despesas?select=drs,rras,municipio,rotulo,tipo_despesa,unidade,regiao_ad,regiao_sa,cod_ibge&drs=not.is.null&drs=neq.&limit=1`, {headers: h});
  if (r.ok) {
    const data = await r.json();
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log('Query failed:', r.status, await r.text());
  }

  // Check if enrichment is still running (lock)
  console.log('\n=== Enrichment lock check ===');
  const r2 = await fetch(`${url}/rest/v1/rpc/refresh_dashboard_batch`, {
    method: 'POST', headers: h, body: JSON.stringify({ p_batch_size: 1 })
  });
  const txt = await r2.text();
  console.log(`refresh_dashboard_batch(1): ${r2.status} - ${txt.substring(0, 200)}`);
})();
