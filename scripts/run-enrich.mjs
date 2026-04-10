/**
 * run-enrich.mjs
 * -----------------------------------------------------------------------
 * Enriquece lc131_despesas chamando refresh_dashboard_batch em loop.
 * Preenche: drs, rras, cod_ibge, municipio, rotulo, tipo_despesa,
 *           unidade, regiao_ad, regiao_sa, grupo_despesa, pago_total
 *
 * PRÉ-REQUISITO:
 *   Execute scripts/fix-enrich-all.sql no SQL Editor ANTES de rodar.
 *
 * USO:
 *   $env:NODE_TLS_REJECT_UNAUTHORIZED="0"; node scripts/run-enrich.mjs
 * -----------------------------------------------------------------------
 */

const SUPA_URL = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODkwNDQsImV4cCI6MjA5MTM2NTA0NH0.t3tWIh3F9lmg-a6zzdmoKpupHB9i7hTfvFmPyFbZNZs';
const BATCH_SIZE = 5000;
const MAX_ITERATIONS = 200;

const headers = {
  apikey: SUPA_KEY,
  Authorization: 'Bearer ' + SUPA_KEY,
  'Content-Type': 'application/json',
};

async function callBatch(batchSize) {
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/refresh_dashboard_batch`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_batch_size: batchSize }),
  });
  const text = await r.text();
  if (!r.ok) {
    throw new Error(`HTTP ${r.status}: ${text.substring(0, 300)}`);
  }
  return parseInt(text) || 0;
}

async function checkSample() {
  const h = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY };
  const r = await fetch(`${SUPA_URL}/rest/v1/lc131_despesas?select=drs,rras,municipio,rotulo,tipo_despesa,grupo_despesa&limit=3`, { headers: h });
  if (r.ok) return await r.json();
  return null;
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  ENRICHMENT — refresh_dashboard_batch em loop');
  console.log(`  Batch size: ${BATCH_SIZE} | Max iterations: ${MAX_ITERATIONS}`);
  console.log('═══════════════════════════════════════════════════\n');

  // Check if lock is still held
  try {
    const test = await callBatch(1);
    console.log(`✅ Lock liberado. Teste retornou: ${test}\n`);
  } catch (e) {
    if (e.message.includes('55P03')) {
      console.error('❌ LOCK AINDA TRAVADO! Execute fix-enrich-all.sql no SQL Editor primeiro.');
      console.error('   O passo 1 mata a transação travada.');
      process.exit(1);
    }
    throw e;
  }

  const t0 = Date.now();
  let totalUpdated = 0;
  let iteration = 0;

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    try {
      const count = await callBatch(BATCH_SIZE);
      totalUpdated += count;
      
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
      process.stdout.write(
        `\r  Batch ${iteration}: +${count} (total: ${totalUpdated.toLocaleString('pt-BR')}, ${elapsed}s)`
      );

      if (count === 0) {
        console.log(`\n\n✅ CONCLUÍDO! ${totalUpdated.toLocaleString('pt-BR')} registros enriquecidos em ${elapsed}s`);
        break;
      }
    } catch (e) {
      console.error(`\n\n❌ Erro no batch ${iteration}: ${e.message}`);
      if (e.message.includes('55P03')) {
        console.error('   Lock detectado. Aguarde ou execute fix-enrich-all.sql novamente.');
        process.exit(1);
      }
      // Retry on timeout
      if (e.message.includes('57014') || e.message.includes('timeout')) {
        console.log('   ⏳ Timeout, tentando novamente com batch menor...');
        try {
          const count2 = await callBatch(Math.floor(BATCH_SIZE / 2));
          totalUpdated += count2;
          console.log(`   ✅ Retry OK: +${count2}`);
        } catch (e2) {
          console.error(`   ❌ Retry também falhou: ${e2.message}`);
          process.exit(1);
        }
      }
    }
  }

  if (iteration >= MAX_ITERATIONS) {
    console.log(`\n⚠️  Limite de ${MAX_ITERATIONS} iterações atingido. Total: ${totalUpdated}`);
  }

  // Verify
  console.log('\n── Verificação ──');
  const sample = await checkSample();
  if (sample) {
    console.log('Amostra de dados enriquecidos:');
    sample.forEach((r, i) => {
      console.log(`  Row ${i + 1}: drs=${r.drs || '(null)'}, rras=${r.rras || '(null)'}, municipio=${r.municipio || '(null)'}, rotulo=${r.rotulo || '(null)'}, tipo=${r.tipo_despesa || '(null)'}, grupo=${r.grupo_despesa || '(null)'}`);
    });
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
