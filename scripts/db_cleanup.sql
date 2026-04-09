-- ================================================================
-- LIMPEZA DO BANCO — Execute no Supabase SQL Editor
-- Remove tabelas/views desnecessárias e cria índices
-- ================================================================
SET statement_timeout = 0;

-- 1) Remover tabela 'despesas' (duplicada, dados já estão em lc131_despesas)
DROP TABLE IF EXISTS public.despesas CASCADE;

-- 2) Remover view 'lc131_enriquecida' (app usa RPC functions)
DROP VIEW IF EXISTS public.lc131_enriquecida CASCADE;

-- 3) Remover tabela compact se existir (tentativa anterior)
DROP TABLE IF EXISTS public.lc131_compact CASCADE;

-- 4) Criar índices para performance (evita 504 timeout)
CREATE INDEX IF NOT EXISTS idx_lc131_ano       ON public.lc131_despesas (ano_referencia);
CREATE INDEX IF NOT EXISTS idx_lc131_drs       ON public.lc131_despesas (drs);
CREATE INDEX IF NOT EXISTS idx_lc131_municipio ON public.lc131_despesas (municipio);
CREATE INDEX IF NOT EXISTS idx_lc131_ano_drs   ON public.lc131_despesas (ano_referencia, drs);

-- 5) Verificar tamanho após limpeza
SELECT 'TAMANHO TOTAL' AS info, pg_size_pretty(pg_database_size(current_database())) AS valor
UNION ALL
SELECT relname, pg_size_pretty(pg_total_relation_size(oid))
FROM pg_class
WHERE relname IN ('lc131_despesas', 'bd_ref', 'tab_drs', 'tab_rras')
ORDER BY 1;
