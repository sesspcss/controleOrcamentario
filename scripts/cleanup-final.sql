-- ================================================================
-- LIMPEZA FINAL — Reduzir tamanho do banco sem perder nada
--
-- SITUAÇÃO ATUAL (diagnóstico):
--   • 465.845 linhas em lc131_despesas (5 anos: 2022-2026)
--   • lc131_mv: já removido ✓
--   • lc131_enriquecida: ainda existe (view obsoleta)
--   • tab_drs + tab_rras: ainda existem (dados já em tab_municipios)
--   • BLOAT: reimports e updates em massa geram dead tuples (20-40% desperdício)
--
-- ECONOMIA ESTIMADA:
--   VACUUM FULL lc131_despesas     → 50-150 MB (maior ganho)
--   DROP lc131_enriquecida         → 0-5 MB (view)
--   DROP tab_drs + tab_rras        → 2-5 MB
--   TOTAL ESTIMADO: 50-160 MB — suficiente para voltar ao free tier
--
-- Execute no Supabase SQL Editor (ou via VPN/rede sem firewall)
-- ================================================================

SET statement_timeout = 0;
SET lock_timeout = '10min';

-- ============================================================
-- PASSO 1: Remover objetos obsoletos (pequenos mas desnecessários)
-- ============================================================

-- View antiga — dados agora vêm de lc131_despesas + RPCs
DROP VIEW IF EXISTS public.lc131_enriquecida CASCADE;

-- Tabelas de referência substituídas por tab_municipios
DROP TABLE IF EXISTS public.tab_drs  CASCADE;
DROP TABLE IF EXISTS public.tab_rras CASCADE;

-- Tabela de compactação se existir de tentativa anterior
DROP TABLE IF EXISTS public.lc131_compact CASCADE;
DROP TABLE IF EXISTS public.despesas CASCADE;

-- ============================================================
-- PASSO 2: VACUUM FULL
-- !! NÃO INCLUSO AQUI !!
-- VACUUM não pode rodar dentro de transação (erro 25001).
-- Execute o arquivo cleanup-vacuum.sql SEPARADAMENTE:
--   Cole APENAS a linha abaixo no SQL Editor e clique Run:
--     VACUUM FULL public.lc131_despesas;
--   Depois cole e execute cada uma das outras:
--     VACUUM FULL public.bd_ref;
--     VACUUM FULL public.tab_municipios;
-- Ou use o arquivo scripts/cleanup-vacuum.sql (uma por vez).
-- ============================================================

-- ============================================================
-- PASSO 3: Verificar índices — garantir que os essenciais existem
-- ============================================================

-- Índices essenciais para performance das RPCs
CREATE INDEX IF NOT EXISTS idx_lc131_ano
  ON public.lc131_despesas (ano_referencia);

CREATE INDEX IF NOT EXISTS idx_lc131_drs
  ON public.lc131_despesas (drs);

CREATE INDEX IF NOT EXISTS idx_lc131_municipio
  ON public.lc131_despesas (municipio);

CREATE INDEX IF NOT EXISTS idx_lc131_ano_drs
  ON public.lc131_despesas (ano_referencia, drs);

CREATE INDEX IF NOT EXISTS idx_lc131_rras
  ON public.lc131_despesas (rras);

-- ============================================================
-- PASSO 4: Verificação final de tamanho
-- ============================================================
SELECT
  relname                                           AS tabela,
  pg_size_pretty(pg_total_relation_size(oid))       AS tamanho_total,
  pg_size_pretty(pg_relation_size(oid))             AS dados,
  pg_size_pretty(pg_total_relation_size(oid)
                 - pg_relation_size(oid))            AS indices,
  reltuples::bigint                                 AS linhas_est
FROM pg_class
WHERE relname IN (
  'lc131_despesas', 'bd_ref', 'tab_municipios',
  'tab_drs', 'tab_rras', 'lc131_enriquecida', 'lc131_mv'
)
AND relkind IN ('r','m','v')
ORDER BY pg_total_relation_size(oid) DESC;

-- Tamanho total do banco
SELECT
  'BANCO TOTAL' AS info,
  pg_size_pretty(pg_database_size(current_database())) AS tamanho;

-- ============================================================
-- PASSO 5: Confirmar que os índices pesados antigos foram removidos
-- (já feito pelas otimizações anteriores, mas confere)
-- ============================================================
SELECT indexrelname AS indexname,
       pg_size_pretty(pg_relation_size(indexrelid)) AS tamanho
FROM pg_stat_user_indexes
WHERE relname = 'lc131_despesas'
ORDER BY pg_relation_size(indexrelid) DESC;

NOTIFY pgrst, 'reload schema';
