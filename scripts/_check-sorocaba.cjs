process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTc4OTA0NCwiZXhwIjoyMDkxMzY1MDQ0fQ.YUaFE11ZfuKAaRj1UMmhvLr3bN_1yjP9D2WDBcpBee0';
const URL = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };

async function main() {
  // 1. Ver todos os tipos de Sorocaba ano 2026
  const r1 = await fetch(
    URL + '/rest/v1/rpc/lc131_pivot',
    {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_municipio: 'SOROCABA', p_ano: 2026, p_tipo: null, p_rotulo: null, p_drs: null, p_grupo: null, p_elemento: null, p_fonte: null, p_uo: null, p_favorecido: null, p_ug: null, p_rras: null, p_regiao: null })
    }
  );
  console.log('=== PIVOT SOROCABA 2026 ===');
  const pivot = await r1.json();
  console.log(JSON.stringify(pivot, null, 2).substring(0, 3000));

  // 2. Ver registros com TRANSFERÊNCIA VOLUNTÁRIA em Sorocaba 2026
  const r2 = await fetch(
    URL + '/rest/v1/lc131_despesas?select=id,descricao_processo,codigo_nome_ug,codigo_nome_favorecido,valor_pago_total&tipo_despesa=eq.TRANSFER%C3%8ANCIA%20VOLUNT%C3%81RIA&ano_referencia=eq.2026&limit=30',
    { headers: H }
  );
  const rows = await r2.json();
  console.log('\n=== TRANSFERÊNCIA VOLUNTÁRIA 2026 (primeiros 30) ===');
  rows.forEach(r => console.log(r.id, '|', r.descricao_processo, '|', r.codigo_nome_ug, '|', r.valor_pago_total));

  // 3. Ver o que a função classificaria agora — testar via RPC
  const r3 = await fetch(
    URL + '/rest/v1/rpc/fix_tipo_despesa_by_year',
    {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_ano: 2026, p_id_min: null, p_id_max: null })
    }
  );
  const fix = await r3.json();
  console.log('\n=== FIX RESULT 2026 ===', JSON.stringify(fix));
}
main().catch(console.error);
