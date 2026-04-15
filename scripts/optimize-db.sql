-- ================================================================
-- optimize-db.sql — Otimização de performance e redução de tamanho
-- ================================================================
-- INSTRUÇÕES:
--   PARTE A (cole tudo de uma vez no SQL Editor): linhas abaixo até "PARTE B"
--   PARTE B (cole e execute UMA linha de cada vez): VACUUM
--   PARTE C (cole e execute separado): CLUSTER
-- ================================================================
-- NOTA: VACUUM não pode rodar em bloco de transação.
-- Run each VACUUM separately in a new SQL Editor tab.
-- ================================================================

-- ════════════════════════════════════════════
-- PARTE A — cole tudo de uma vez no SQL Editor
-- ════════════════════════════════════════════

-- ─ 1. Remover índices duplicados ou pouco seletivos ──────────────
DROP INDEX IF EXISTS public.idx_lc131_municipio;
DROP INDEX IF EXISTS public.idx_lc131_tipo;
DROP INDEX IF EXISTS public.idx_lc131_ano;
DROP INDEX IF EXISTS public.idx_lc131_drs;
DROP INDEX IF EXISTS public.idx_lc131_rras;
DROP INDEX IF EXISTS public.idx_lc131_regiao_ad;
DROP INDEX IF EXISTS public.idx_lc131_fonte;
DROP INDEX IF EXISTS public.idx_lc131_tipo_despesa_full;
DROP INDEX IF EXISTS public.idx_lc131_rotulo_full;

-- ─ 2. Índices parciais — ignoram NULLs, ocupam muito menos espaço ─
CREATE INDEX IF NOT EXISTS idx_lc131_tipo_despesa_nn
  ON public.lc131_despesas (tipo_despesa)
  WHERE tipo_despesa IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lc131_rotulo_nn
  ON public.lc131_despesas (rotulo)
  WHERE rotulo IS NOT NULL AND rotulo <> '';

-- ─ 3. Reconstruir índices (pode ser lento — aguarde a conclusão) ──
REINDEX TABLE public.lc131_despesas;
REINDEX TABLE public.bd_ref_tipo;

-- ─ 4. Atualizar estatísticas do planejador ───────────────────────
ANALYZE public.lc131_despesas;
ANALYZE public.bd_ref_tipo;
ANALYZE public.bd_ref_lookup_l1;
ANALYZE public.bd_ref_lookup_l2;
ANALYZE public.bd_ref_lookup_l3;
ANALYZE public.tab_municipios;

-- ─ 5. Verificar tamanho atual ────────────────────────────────────
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size('public.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size('public.'||tablename))       AS table_size,
  pg_size_pretty(pg_indexes_size('public.'||tablename))        AS indexes_size
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('lc131_despesas','bd_ref_tipo','bd_ref_lookup_l1','bd_ref_lookup_l2','bd_ref_lookup_l3','tab_municipios')
ORDER BY pg_total_relation_size('public.'||tablename) DESC;

SELECT pg_size_pretty(sum(pg_total_relation_size(schemaname||'.'||tablename))) AS total_db_size
FROM pg_tables WHERE schemaname = 'public';


-- ════════════════════════════════════════════════════════════════════
-- PARTE B — cole e execute CADA linha separadamente em nova aba
-- (VACUUM não pode rodar junto com outros comandos)
-- ════════════════════════════════════════════════════════════════════

-- Execute cada uma dessas em aba separada, uma de cada vez:
/*
VACUUM FULL ANALYZE public.lc131_despesas;
*/
/*
VACUUM FULL ANALYZE public.bd_ref_tipo;
*/
/*
VACUUM FULL ANALYZE public.bd_ref_lookup_l1;
*/
/*
VACUUM FULL ANALYZE public.bd_ref_lookup_l2;
*/
/*
VACUUM FULL ANALYZE public.bd_ref_lookup_l3;
*/
/*
VACUUM FULL ANALYZE public.tab_municipios;
*/


-- ════════════════════════════════════════════════════════════════════
-- PARTE C — execute sozinho após o VACUUM da lc131_despesas
-- Reorganiza fisicamente os dados por ano+id (melhora leituras seq.)
-- ════════════════════════════════════════════════════════════════════
/*
CLUSTER public.lc131_despesas USING idx_lc131_ano_id;
ANALYZE public.lc131_despesas;
*/

