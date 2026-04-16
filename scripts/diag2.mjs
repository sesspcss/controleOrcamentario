process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const URL = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTc4OTA0NCwiZXhwIjoyMDkxMzY1MDQ0fQ.YUaFE11ZfuKAaRj1UMmhvLr3bN_1yjP9D2WDBcpBee0';
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

async function countTable(t) {
  const r = await fetch(`${URL}/rest/v1/${t}?select=count`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } });
  return r.headers.get('content-range');
}
async function get(path) {
  const r = await fetch(URL + path, { headers: H });
  return r.json();
}

// Probes specific descriptions in bd_ref_tipo and bd_ref_lookup_l2
async function probe(ug, desc) {
  const [r1, r2] = await Promise.all([
    get(`/rest/v1/bd_ref_tipo?select=tipo_despesa&codigo_nome_ug=eq.${encodeURIComponent(ug)}&descricao_processo=eq.${encodeURIComponent(desc)}&limit=5`),
    get(`/rest/v1/bd_ref_lookup_l2?select=tipo_despesa&codigo_nome_ug=eq.${encodeURIComponent(ug)}&descricao_processo=eq.${encodeURIComponent(desc)}&limit=5`),
  ]);
  return { bd_ref_tipo: r1.map(r => r.tipo_despesa), l2: r2.map(r => r.tipo_despesa) };
}

async function main() {
  // 1. Sample problematic lc131 rows
  const lc = await get('/rest/v1/lc131_despesas?select=codigo_nome_ug,descricao_processo,codigo_nome_projeto_atividade,tipo_despesa&municipio=eq.SOROCABA&ano_referencia=eq.2025&limit=10');
  console.log('=== lc131 Sorocaba 2025 (10 rows) ===');
  for (const r of lc) {
    const p = await probe(r.codigo_nome_ug, r.descricao_processo);
    console.log(`  desc: "${r.descricao_processo}"`);
    console.log(`  tipo_atual: ${r.tipo_despesa}`);
    console.log(`  bd_ref_tipo match: ${JSON.stringify(p.bd_ref_tipo)} | L2 match: ${JSON.stringify(p.l2)}`);
    console.log('');
  }

  // 2. Specific key rows
  const ug196 = '090196 - COORD. DE GESTAO ORCAMENTARIA E FINANCEIRA';
  const probes = [
    [ug196, 'RESOLUCAO SS N. 198 DE 29 DE DEZEMBRO DE 2023'],
    [ug196, 'GESTAO ESTADUAL - TETO FIXO FILANTROPICOS'],
    [ug196, 'GESTAO ESTADUAL - TABELA SUS PAULISTA'],
    [ug196, 'TRANSFERENCIA VOLUNTARIA - TABELA SUS PAULISTA'],
  ];
  console.log('\n=== Probe específico UG 090196 ===');
  for (const [ug, desc] of probes) {
    const p = await probe(ug, desc);
    console.log(`  desc: "${desc}"`);
    console.log(`  bd_ref_tipo: ${JSON.stringify(p.bd_ref_tipo)} | L2: ${JSON.stringify(p.l2)}`);
  }

  // 3. What types does bd_ref_tipo have for Sorocaba UGs?
  const sorocabaUgs = [...new Set(lc.map(r => r.codigo_nome_ug))];
  console.log('\n=== bd_ref_tipo tipos para UGs de Sorocaba ===');
  for (const ug of sorocabaUgs.slice(0, 3)) {
    const rows = await get(`/rest/v1/bd_ref_tipo?select=tipo_despesa&codigo_nome_ug=eq.${encodeURIComponent(ug)}`);
    const cnt = {};
    rows.forEach(r => { cnt[r.tipo_despesa] = (cnt[r.tipo_despesa] || 0) + 1; });
    console.log(`  UG: ${ug}`);
    Object.entries(cnt).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`    ${v}x ${k}`));
  }
}

main().catch(e => console.error('FATAL:', e.message));
