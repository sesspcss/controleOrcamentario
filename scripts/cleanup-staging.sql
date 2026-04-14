-- ================================================================
-- Remove tabela staging deixada pelo processo de rebuild abortado.
-- lc131_despesas_staging: 210.000 linhas, ~330 MB — não usada por nenhuma
-- lógica da aplicação. Seguro remover.
-- Execute no Supabase SQL Editor.
-- ================================================================

DROP TABLE IF EXISTS public.lc131_despesas_staging;

-- Confirma remoção
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS tamanho
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
