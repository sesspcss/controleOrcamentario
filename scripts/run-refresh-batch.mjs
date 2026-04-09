/**
 * run-refresh-batch.mjs
 * Executa refresh_dashboard_batch repetidamente via RPC até 0 rows restantes.
 * Cada chamada processa 5000 registros para evitar timeout.
 *
 * Pré-requisito: executar o SQL compact_functions_all.sql no Supabase SQL Editor
 * para criar/atualizar a função refresh_dashboard_batch.
 *
 * Uso: node scripts/run-refresh-batch.mjs
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://odnstbeuiojohutoqvvw.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kbnN0YmV1aW9qb2h1dG9xdnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTQ1NzgsImV4cCI6MjA5MDA5MDU3OH0._71Nt-rjs3EvOuDcGcQcPFKug-iDg_dEs38UVLBLJEQ";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const BATCH_SIZE = 5000;

async function main() {
  let totalUpdated = 0;
  let iteration = 0;

  // First check how many records need enrichment
  const { data: countData, error: countErr } = await supabase
    .from("lc131_despesas")
    .select("id", { count: "exact", head: true })
    .or("drs.is.null,rotulo.is.null");

  if (countErr) {
    console.error("Erro ao contar registros pendentes:", countErr.message);
  } else {
    console.log(`Registros pendentes de enriquecimento: ${countData}`);
  }

  console.log(`\nIniciando refresh em batches de ${BATCH_SIZE}...\n`);

  while (true) {
    iteration++;
    const t0 = Date.now();

    const { data, error } = await supabase.rpc("refresh_dashboard_batch", {
      p_batch_size: BATCH_SIZE,
    });

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    if (error) {
      console.error(`Batch ${iteration} ERRO (${elapsed}s):`, error.message);
      // If function doesn't exist yet, tell user
      if (error.message.includes("Could not find the function") || error.message.includes("not found")) {
        console.error("\n⚠ A função refresh_dashboard_batch não existe no Supabase.");
        console.error("Execute o arquivo compact_functions_all.sql no SQL Editor primeiro.");
      }
      break;
    }

    const rowsAffected = typeof data === "number" ? data : parseInt(data, 10) || 0;
    totalUpdated += rowsAffected;

    console.log(
      `Batch ${iteration}: ${rowsAffected} registros atualizados (${elapsed}s) | Total: ${totalUpdated}`
    );

    if (rowsAffected === 0) {
      console.log("\n✅ Refresh completo! Total atualizado:", totalUpdated);
      break;
    }
  }
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
