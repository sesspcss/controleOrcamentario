// Verifica e copia descricao_do_processo → descricao_processo (idem numero)
const SUPA_URL = 'https://odnstbeuiojohutoqvvw.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kbnN0YmV1aW9qb2h1dG9xdnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTQ1NzgsImV4cCI6MjA5MDA5MDU3OH0._71Nt-rjs3EvOuDcGcQcPFKug-iDg_dEs38UVLBLJEQ';
const hdrs = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' };

async function rpc(fn, args = {}) {
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: hdrs, body: JSON.stringify(args)
  });
  return r.ok ? await r.json() : `ERR ${r.status}: ${await r.text()}`;
}

async function query(table, select, extra = '') {
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}${extra}`, {
    headers: { ...hdrs, Prefer: 'count=exact' }
  });
  const cnt = r.headers.get('content-range');
  const data = await r.json();
  return { data, count: cnt };
}

async function main() {
  console.log('=== Diagnóstico colunas processo ===\n');

  // 1. Buscar 1 linha com TODAS as colunas para ver quais existem
  console.log('1. Buscando colunas da tabela...');
  const r1 = await fetch(`${SUPA_URL}/rest/v1/lc131_despesas?select=*&limit=1`, { headers: hdrs });
  if (!r1.ok) { console.log('ERR:', await r1.text()); return; }
  const rows = await r1.json();
  if (!rows.length) { console.log('Tabela vazia!'); return; }

  const cols = Object.keys(rows[0]).sort();
  const processCols = cols.filter(c => c.includes('processo') || c.includes('descricao') || c.includes('numero'));
  console.log('Colunas com "processo/descricao/numero":', processCols);

  // 2. Check de cada coluna
  for (const col of ['descricao_processo', 'numero_processo', 'descricao_do_processo', 'numero_do_processo']) {
    if (cols.includes(col)) {
      // contar não nulos
      const { count } = await query('lc131_despesas', col, `&${col}=not.is.null&limit=0`);
      console.log(`  ${col}: existe, não-nulos = ${count}`);
      // amostra
      if (count && !count.endsWith('/0')) {
        const { data } = await query('lc131_despesas', col, `&${col}=not.is.null&limit=3`);
        console.log(`    amostra:`, data.map(r => r[col]));
      }
    } else {
      console.log(`  ${col}: NÃO EXISTE na tabela`);
    }
  }

  // 3. Listar ALL colunas que contenham 'desc' ou 'num' ou 'proc'
  const relatedCols = cols.filter(c => c.includes('desc') || (c.includes('num') && !c.includes('mun')) || c.includes('proc'));
  console.log('\nTodas colunas relacionadas:', relatedCols);

  // 4. Mostrar amostra de uma linha completa (campos processo)
  console.log('\nAmostra row[0] campos relevantes:');
  for (const col of relatedCols) {
    console.log(`  ${col}: "${rows[0][col]}"`);
  }
}

main().catch(e => console.error(e));
