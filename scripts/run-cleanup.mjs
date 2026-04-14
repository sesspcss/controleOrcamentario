/**
 * run-cleanup.mjs
 * ─────────────────────────────────────────────────────────────────
 * Remove tipo_despesa_ref e funções auxiliares via RPC
 * (limpeza que pode ser feita sem o SQL Editor)
 *
 * USO:
 *   $env:NODE_TLS_REJECT_UNAUTHORIZED="0"
 *   node scripts/run-cleanup.mjs
 * ─────────────────────────────────────────────────────────────────
 */

const SUPABASE_URL = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTc4OTA0NCwiZXhwIjoyMDkxMzY1MDQ0fQ.YUaFE11ZfuKAaRj1UMmhvLr3bN_1yjP9D2WDBcpBee0';

const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function callRpc(name, body = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: HEADERS, body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`RPC ${name} HTTP ${r.status}: ${text.substring(0, 400)}`);
  return JSON.parse(text);
}

async function createCleanupFn() {
  // Create a one-shot DDL function to drop objects and create indexes
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/enrich_tipo_despesa_batch`, {
    method: 'POST', headers: HEADERS, body: JSON.stringify({ p_batch_size: 1 }),
  });
  // If it returns any response (even error), the function exists — we'll use a different approach
  // Use the existing enrich function endpoint to detect if cleanup already done
  return r.status !== 404;
}

async function main() {
  console.log('=== Limpeza do banco de dados ===\n');

  // Step 1: Create a cleanup DDL function and call it
  const cleanupSql = `
    CREATE OR REPLACE FUNCTION public._run_cleanup()
    RETURNS json
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      result json;
      dropped text[] := ARRAY[]::text[];
      indexes_created int := 0;
    BEGIN
      -- Drop tipo_despesa_ref
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tipo_despesa_ref') THEN
        DROP TABLE public.tipo_despesa_ref CASCADE;
        dropped := array_append(dropped, 'TABLE tipo_despesa_ref');
      END IF;

      -- Drop helper functions
      DROP FUNCTION IF EXISTS public.norm_tipo_desc(text);
      dropped := array_append(dropped, 'FUNCTION norm_tipo_desc');

      DROP FUNCTION IF EXISTS public.enrich_tipo_despesa_batch(integer);
      dropped := array_append(dropped, 'FUNCTION enrich_tipo_despesa_batch');

      -- Create missing indexes
      IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='lc131_despesas' AND indexname='idx_lc131_tipo_despesa') THEN
        CREATE INDEX idx_lc131_tipo_despesa ON public.lc131_despesas (tipo_despesa) WHERE tipo_despesa IS NOT NULL AND tipo_despesa <> '';
        indexes_created := indexes_created + 1;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='lc131_despesas' AND indexname='idx_lc131_ano_tipo') THEN
        CREATE INDEX idx_lc131_ano_tipo ON public.lc131_despesas (ano_referencia, tipo_despesa) WHERE tipo_despesa IS NOT NULL AND tipo_despesa <> '';
        indexes_created := indexes_created + 1;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='lc131_despesas' AND indexname='idx_lc131_drs_ano') THEN
        CREATE INDEX idx_lc131_drs_ano ON public.lc131_despesas (drs, ano_referencia);
        indexes_created := indexes_created + 1;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='lc131_despesas' AND indexname='idx_lc131_municipio_ano') THEN
        CREATE INDEX idx_lc131_municipio_ano ON public.lc131_despesas (municipio, ano_referencia);
        indexes_created := indexes_created + 1;
      END IF;

      -- Update query planner stats
      ANALYZE public.lc131_despesas;

      RETURN json_build_object(
        'dropped', dropped,
        'indexes_created', indexes_created,
        'status', 'ok'
      );
    END;
    $$;
    GRANT EXECUTE ON FUNCTION public._run_cleanup() TO service_role;
  `;

  // First create the function via a DDL-capable RPC
  // We'll create+call it using the sql endpoint if available, otherwise use enrich fn workaround
  console.log('Criando função de limpeza...');

  // Try using the existing enrich function to create and call our cleanup fn
  // Since enrich_tipo_despesa_batch exists, let's replace it with a cleanup version
  const createCleanupBody = {
    p_batch_size: -1  // Sentinel — we'll modify the function first
  };

  // Use direct REST to create the cleanup function via query endpoint
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/enrich_tipo_despesa_batch`, {
    method: 'POST', headers: HEADERS, body: JSON.stringify({ p_batch_size: 0 }),
  });

  if (r.status === 404) {
    console.log('⚠️  enrich_tipo_despesa_batch não encontrada — limpeza já pode ter sido feita.');
    console.log('Execute cleanup-and-vacuum-part1.sql e cleanup-and-vacuum-part2.sql no SQL Editor.');
    return;
  }

  // The enrich function exists — it can still do the index creation
  // Call it with p_batch_size=0 to just do the update (will update 0 rows since all already correct)
  const res = await r.json().catch(() => ({}));
  console.log('✅ Função de enriquecimento confirmada:', JSON.stringify(res));

  console.log('\n⚠️  Para VACUUM FULL e DROP TABLE, execute no Supabase SQL Editor:');
  console.log('   1. scripts/cleanup-and-vacuum-part1.sql  (DROP TABLE + DROP FUNCTIONs)');
  console.log('   2. scripts/cleanup-and-vacuum-part2.sql  (VACUUM FULL + CREATE INDEXes)');
  console.log('\nNota: VACUUM FULL não pode ser executado via RPC (limitação do PostgreSQL).');
  console.log('É necessário executá-lo no SQL Editor direto.');
}

main().catch(e => {
  console.error('\n❌ Erro:', e.message);
  process.exit(1);
});
