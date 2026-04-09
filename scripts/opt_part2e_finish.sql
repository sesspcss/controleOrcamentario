-- ================================================================
-- PARTE 2e — Índice, VACUUM, View, Grants, Verificação
-- ================================================================
SET statement_timeout = 0;

CREATE INDEX IF NOT EXISTS idx_lc131_drs
  ON public.lc131_despesas (drs) WHERE drs IS NOT NULL AND drs <> '';

-- VACUUM removido — não roda no SQL Editor (transaction block).
-- O autovacuum do Postgres reclama o espaço automaticamente.

CREATE OR REPLACE VIEW public.lc131_enriquecida AS
  SELECT * FROM public.lc131_despesas;

GRANT SELECT ON public.lc131_enriquecida TO anon, authenticated;
GRANT SELECT ON public.lc131_despesas    TO anon, authenticated;
GRANT SELECT ON public.bd_ref            TO anon, authenticated;

-- Verificação final
SELECT pg_size_pretty(pg_database_size(current_database())) AS tamanho_atual;
SELECT COUNT(*) AS total, COUNT(drs) AS com_drs, COUNT(pago_total) AS com_pago_total
FROM public.lc131_despesas;
