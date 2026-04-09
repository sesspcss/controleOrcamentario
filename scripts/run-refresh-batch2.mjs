/**
 * run-refresh-batch2.mjs
 * Versão corrigida para Node v24 - usa undici Agent para bypass TLS
 */
import { createClient } from "@supabase/supabase-js";
import https from "node:https";

const SUPABASE_URL = "https://odnstbeuiojohutoqvvw.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kbnN0YmV1aW9qb2h1dG9xdnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTQ1NzgsImV4cCI6MjA5MDA5MDU3OH0._71Nt-rjs3EvOuDcGcQcPFKug-iDg_dEs38UVLBLJEQ";

// Custom fetch for Node v24 TLS issues
const agent = new https.Agent({ rejectUnauthorized: false });

function customFetch(url, options = {}) {
  // Use node-native https agent for TLS bypass
  return fetch(url, {
    ...options,
    dispatcher: undefined, // reset undici dispatcher
  });
}

// First try: simple raw https request to verify connectivity
function testRaw() {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/rpc/refresh_dashboard_batch`);
    const req = https.request(
      {
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: "POST",
        rejectUnauthorized: false,
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Prefer: "return=representation",
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on("error", reject);
    req.write(JSON.stringify({ p_batch_size: 10 }));
    req.end();
  });
}

async function callBatchRaw(batchSize) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/rpc/refresh_dashboard_batch`);
    const req = https.request(
      {
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: "POST",
        rejectUnauthorized: false,
        timeout: 120000,
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Prefer: "return=representation",
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          } else {
            resolve(parseInt(body, 10) || 0);
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout (120s)"));
    });
    req.write(JSON.stringify({ p_batch_size: batchSize }));
    req.end();
  });
}

const BATCH_SIZE = 5000;

async function main() {
  // Quick connectivity test
  console.log("Testando conectividade com raw HTTPS...");
  try {
    const result = await testRaw();
    console.log(`  Status: ${result.status}, Body: ${result.body.substring(0, 100)}`);
    if (result.status === 404) {
      console.error("\n⚠ A função refresh_dashboard_batch não existe.");
      console.error("Execute o compact_functions_all.sql no SQL Editor e depois NOTIFY pgrst, 'reload schema';");
      process.exit(1);
    }
  } catch (e) {
    console.error("  Erro:", e.message);
    process.exit(1);
  }

  console.log(`\nIniciando refresh em batches de ${BATCH_SIZE}...\n`);

  let totalUpdated = 0;
  let iteration = 0;

  while (true) {
    iteration++;
    const t0 = Date.now();

    try {
      const rowsAffected = await callBatchRaw(BATCH_SIZE);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      totalUpdated += rowsAffected;

      console.log(
        `Batch ${iteration}: ${rowsAffected} registros (${elapsed}s) | Total: ${totalUpdated}`
      );

      if (rowsAffected === 0) {
        console.log("\n✅ Refresh completo! Total atualizado:", totalUpdated);
        break;
      }
    } catch (e) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.error(`Batch ${iteration} ERRO (${elapsed}s): ${e.message}`);
      break;
    }
  }
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
