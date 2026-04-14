-- ================================================================
-- REDUZIR TAMANHO DO BANCO — sem alterar dados ou comportamento
-- Execute cada bloco SEPARADAMENTE no Supabase SQL Editor
-- ================================================================

-- ============================================================
-- BLOCO 1: Dropar índices inutilizados (~25 MB)
-- Estes índices foram criados para ORDER BY mas as RPCs
-- nunca filtram WHERE empenhado = X — só fazem SUM(empenhado).
-- Os índices de filtro (drs, tipo_despesa, rotulo, ano, etc.) ficam.
-- Execute este bloco completo de uma vez:
-- ============================================================
DROP INDEX IF EXISTS public.idx_lc131_empenhado;
DROP INDEX IF EXISTS public.idx_lc131_ano_empenhado;
DROP INDEX IF EXISTS public.idx_lc131_cod_nome_ug_prefix;

-- Confirma o que restou:
SELECT indexrelname AS indexname, pg_size_pretty(pg_relation_size(indexrelid)) AS tamanho
FROM pg_stat_user_indexes
WHERE relname = 'lc131_despesas'
ORDER BY pg_relation_size(indexrelid) DESC;


-- ============================================================
-- BLOCO 2: VACUUM FULL — recupera espaço de dead tuples (~80-150 MB)
-- !! Cole e execute CADA LINHA ABAIXO SOZINHA (uma por vez) !!
-- Os UPDATEs em massa de tipo_despesa + enrich geraram dead tuples.
-- Nenhum dado é alterado — só compacta o armazenamento físico.
-- ============================================================

VACUUM FULL public.lc131_despesas;

-- Depois do anterior terminar (2-5 min), execute:
VACUUM FULL public.bd_ref;

-- Depois:
VACUUM FULL public.tab_municipios;


-- ============================================================
-- BLOCO 3: Verificar tamanho final
-- ============================================================
SELECT
  relname AS objeto,
  pg_size_pretty(pg_total_relation_size('public.'||relname)) AS total,
  pg_size_pretty(pg_relation_size('public.'||relname)) AS tabela,
  pg_size_pretty(pg_total_relation_size('public.'||relname) - pg_relation_size('public.'||relname)) AS indices
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size('public.'||relname) DESC;
