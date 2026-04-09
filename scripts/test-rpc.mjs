/**
 * test-rpc.mjs — Testa se o Supabase RPC está acessível
 */
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://odnstbeuiojohutoqvvw.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kbnN0YmV1aW9qb2h1dG9xdnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTQ1NzgsImV4cCI6MjA5MDA5MDU3OH0._71Nt-rjs3EvOuDcGcQcPFKug-iDg_dEs38UVLBLJEQ"
);

// Test 1: Simple query
console.log("Test 1: Simple select...");
try {
  const { data, error, count } = await supabase
    .from("lc131_despesas")
    .select("id", { count: "exact", head: true })
    .limit(1);
  if (error) console.log("  Error:", error.message);
  else console.log("  OK, count:", count);
} catch (e) {
  console.log("  Exception:", e.message);
  if (e.cause) console.log("  Cause:", e.cause.message || e.cause);
}

// Test 2: count NULL rotulo
console.log("\nTest 2: Count NULL rotulo...");
try {
  const { count, error } = await supabase
    .from("lc131_despesas")
    .select("id", { count: "exact", head: true })
    .is("rotulo", null);
  if (error) console.log("  Error:", error.message);
  else console.log("  Registros com rotulo NULL:", count);
} catch (e) {
  console.log("  Exception:", e.message);
  if (e.cause) console.log("  Cause:", e.cause.message || e.cause);
}

// Test 3: RPC with very small batch
console.log("\nTest 3: refresh_dashboard_batch(10)...");
try {
  const { data, error } = await supabase.rpc("refresh_dashboard_batch", {
    p_batch_size: 10,
  });
  if (error) console.log("  Error:", error.message, error.details, error.hint);
  else console.log("  OK, rows:", data);
} catch (e) {
  console.log("  Exception:", e.message);
  if (e.cause) console.log("  Cause:", e.cause.message || e.cause);
}

// Test 4: RPC schema reload check
console.log("\nTest 4: Check if function exists via raw fetch...");
try {
  const resp = await fetch(
    "https://odnstbeuiojohutoqvvw.supabase.co/rest/v1/rpc/refresh_dashboard_batch",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey:
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kbnN0YmV1aW9qb2h1dG9xdnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTQ1NzgsImV4cCI6MjA5MDA5MDU3OH0._71Nt-rjs3EvOuDcGcQcPFKug-iDg_dEs38UVLBLJEQ",
        Authorization:
          "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kbnN0YmV1aW9qb2h1dG9xdnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTQ1NzgsImV4cCI6MjA5MDA5MDU3OH0._71Nt-rjs3EvOuDcGcQcPFKug-iDg_dEs38UVLBLJEQ",
      },
      body: JSON.stringify({ p_batch_size: 10 }),
    }
  );
  const text = await resp.text();
  console.log("  Status:", resp.status, resp.statusText);
  console.log("  Body:", text.substring(0, 200));
} catch (e) {
  console.log("  Exception:", e.message);
  if (e.cause) console.log("  Cause:", e.cause.message || e.cause);
}
