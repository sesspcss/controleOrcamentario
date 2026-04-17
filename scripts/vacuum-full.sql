-- ================================================================
-- vacuum-full.sql — Recupera espaço do banco
-- EXECUTE NO SUPABASE SQL EDITOR — cada bloco SEPARADAMENTE
-- ================================================================


-- ════════════════════════════════════════════════════════════════
-- EXECUTE AGORA (nesta ordem) — redução imediata, sem espera
-- ════════════════════════════════════════════════════════════════

-- Bloco 0a: TRUNCATE bd_ref_tipo
-- Esta tabela pode ter 100-200 MB e é segura de esvaziar.
-- Os lookups L1-4 permanentes já estão em bd_ref_lookup_l1/l2/l3/l4.
-- TRUNCATE devolve espaço IMEDIATAMENTE, sem precisar de VACUUM.

TRUNCATE TABLE public.bd_ref_tipo;

-- Bloco 0b: DROP de 2 índices redundantes
-- idx_lc131_ano        → já coberto por idx_lc131_ano_id  (ano, id)
-- idx_lc131_cod_projeto → já coberto por idx_lc131_ano_cod_projeto (ano, cod)

DROP INDEX IF EXISTS public.idx_lc131_ano;
DROP INDEX IF EXISTS public.idx_lc131_cod_projeto;

-- Bloco 0c: confirmar ganho imediato
SELECT
  pg_size_pretty(pg_database_size(current_database())) AS db_total,
  pg_size_pretty(pg_total_relation_size('public.lc131_despesas')) AS lc131_total,
  pg_size_pretty(pg_relation_size('public.bd_ref_tipo'))          AS bd_ref_tipo_dados,
  (SELECT count(*) FROM public.bd_ref_tipo)                       AS bd_ref_tipo_linhas;

-- ════════════════════════════════════════════════════════════════


-- ── PASSO 1: Diagnóstico — tamanho por tabela ────────────────────────────────
-- Execute este bloco para ver o que está pesando.

SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS tamanho_total,
  pg_size_pretty(pg_relation_size(schemaname || '.' || tablename))       AS tamanho_tabela,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)
               - pg_relation_size(schemaname || '.' || tablename))       AS tamanho_indices,
  n_dead_tup AS dead_tuples,
  n_live_tup AS live_tuples,
  ROUND(n_dead_tup::numeric / NULLIF(n_live_tup + n_dead_tup, 0) * 100, 1) AS pct_dead
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC;


-- ── PASSO 2: VACUUM FULL na tabela principal (a mais pesada) ─────────────────
-- Execute este bloco SOZINHO — pode levar 2–5 minutos.
-- A tabela fica bloqueada durante a execução.

VACUUM FULL ANALYZE public.lc131_despesas;


-- ── PASSO 3: VACUUM FULL nas lookup tables ───────────────────────────────────
-- Execute depois do passo 2.

VACUUM FULL ANALYZE public.bd_ref_lookup_l1;
VACUUM FULL ANALYZE public.bd_ref_lookup_l2;
VACUUM FULL ANALYZE public.bd_ref_lookup_l3;
VACUUM FULL ANALYZE public.bd_ref_lookup_l4;


-- ── PASSO 4: VACUUM FULL nas tabelas de referência ───────────────────────────

VACUUM FULL ANALYZE public.bd_ref;
VACUUM FULL ANALYZE public.bd_ref_tipo;
VACUUM FULL ANALYZE public.tab_drs;
VACUUM FULL ANALYZE public.tab_rras;
VACUUM FULL ANALYZE public.tab_municipios;


-- ── PASSO 5: Diagnóstico pós-vacuum — verificar redução ──────────────────────
-- Execute o mesmo SELECT do PASSO 1 novamente para comparar.

SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS tamanho_total,
  n_dead_tup AS dead_tuples,
  n_live_tup AS live_tuples
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC;


-- ================================================================
-- PARTE 2: pg_cron — VACUUM FULL automático semanal (PERMANENTE)
-- Execute APENAS UMA VEZ no Supabase SQL Editor.
--
-- REQUISITO: ativar a extensão pg_cron no painel Supabase:
--   Database → Extensions → pesquise "pg_cron" → Enable
--
-- O job roda fora de qualquer transação (conexão própria do cron),
-- por isso VACUUM FULL funciona sem restrições.
-- VACUUM FULL toda domingo às 3h reescreve a tabela do zero,
-- devolvendo espaço ao sistema operacional e mantendo o banco
-- permanentemente abaixo de 500 MB.
-- ================================================================

-- 2a. Remove agendamento anterior se existir (idempotente)
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'vacuum-full-lc131';

-- 2b. Agenda VACUUM FULL toda domingo às 3h
SELECT cron.schedule(
  'vacuum-full-lc131',
  '0 3 * * 0',
  $$VACUUM FULL ANALYZE public.lc131_despesas$$
);

-- 2c. Confirma que o job foi criado
SELECT jobname, schedule, command, active
FROM cron.job
WHERE jobname = 'vacuum-full-lc131';
