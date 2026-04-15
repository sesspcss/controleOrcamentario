-- ================================================================
-- cleanup-db.sql — Limpeza de dados desnecessários para liberar espaço
-- Execute no Supabase SQL Editor (cada PARTE separadamente).
-- NÃO altera lógica, funções nem schema.
-- ================================================================

-- ════════════════════════════════════════════
-- PARTE A — Cole e execute no SQL Editor
-- ════════════════════════════════════════════

-- ─ 1. Corrigir tipo_despesa NULL (direto, sem precisar rodar run-fix-tipo.mjs)
-- Classifica linhas que ficaram sem categoria com fallback adequado.
-- Execute PRIMEIRO e verifique o resultado antes de continuar.
UPDATE public.lc131_despesas
SET tipo_despesa = 'SEM CLASSIFICAÇÃO'
WHERE tipo_despesa IS NULL OR trim(tipo_despesa) = '';

-- Verificar quantas linhas foram atualizadas e quais anos têm mais NULLs:
SELECT ano_referencia, count(*) AS total, count(tipo_despesa) AS classificadas,
       count(*) - count(tipo_despesa) AS sem_tipo
FROM public.lc131_despesas
GROUP BY ano_referencia ORDER BY ano_referencia;


-- ─ 2. Liberar bd_ref_tipo (maior tabela — 416k linhas, ~200MB)
-- Esta tabela foi usada APENAS para construir as tabelas de lookup (L1/L2/L3).
-- Após o refresh_bdref_lookup() ter sido executado, ela não é mais necessária.
-- As funções fix_tipo_despesa_by_year e lc131_pivot NÃO usam bd_ref_tipo diretamente.
TRUNCATE TABLE public.bd_ref_tipo;

-- Verificar tamanho após truncate (antes do VACUUM):
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
-- PARTE B — Execute cada VACUUM em aba separada (não pode estar em bloco)
-- ════════════════════════════════════════════════════════════════════

-- Aba 1 — O mais importante: libera bloat dos bulk UPDATEs de tipo_despesa
/*
VACUUM FULL ANALYZE public.lc131_despesas;
*/

-- Aba 2 — Libera o espaço físico do bd_ref_tipo (após TRUNCATE o espaço
-- físico só é devolvido ao SO com VACUUM FULL)
/*
VACUUM FULL ANALYZE public.bd_ref_tipo;
*/

-- Aba 3 — Verifique o tamanho final após os VACUUMs
/*
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size('public.'||tablename)) AS total_size
FROM pg_tables WHERE schemaname = 'public'
ORDER BY pg_total_relation_size('public.'||tablename) DESC;

SELECT pg_size_pretty(sum(pg_total_relation_size(schemaname||'.'||tablename))) AS total_db_size
FROM pg_tables WHERE schemaname = 'public';
*/
