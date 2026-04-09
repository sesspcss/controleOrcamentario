-- ================================================================
-- PARTE 1 de 4 — DROP do MV + objetos pesados (~300 MB liberados)
-- Execute PRIMEIRO no SQL Editor do Supabase
-- ================================================================
SET statement_timeout = 0;

-- Drop funções que referenciam o MV
DROP FUNCTION IF EXISTS public.lc131_dashboard(integer);
DROP FUNCTION IF EXISTS public.lc131_dashboard(integer,text,text,text,text,text,text,text,text,text,text,text,text,text);
DROP FUNCTION IF EXISTS public.lc131_distincts(integer,text,text,text,text,text,text,text,text,text,text);
DROP FUNCTION IF EXISTS public.lc131_distincts(integer,text,text,text,text,text,text,text,text,text,text,text,text,text);
DROP FUNCTION IF EXISTS public.lc131_detail(integer,text,text,text,text,text,text,text,text,text,text,integer,integer);
DROP FUNCTION IF EXISTS public.lc131_detail(integer,text,text,text,text,text,text,text,text,text,text,text,text,text,integer,integer);
DROP FUNCTION IF EXISTS public.refresh_dashboard();
DROP FUNCTION IF EXISTS public._fix_mojibake(text);

-- DROP MV — libera ~300 MB imediatamente
DROP MATERIALIZED VIEW IF EXISTS public.lc131_mv CASCADE;
DROP VIEW IF EXISTS public.lc131_enriquecida CASCADE;

-- DROP índices pesados
DROP INDEX IF EXISTS idx_lc131_cod_nome_ug_prefix;
DROP INDEX IF EXISTS idx_lc131_cod_projeto;
DROP INDEX IF EXISTS idx_lc131_cod_ug;
DROP INDEX IF EXISTS idx_lc131_nome_municipio;
DROP INDEX IF EXISTS idx_lc131_ano_municipio;
DROP INDEX IF EXISTS idx_lc131_ano_cod_projeto;
DROP INDEX IF EXISTS idx_lc131_codigo_nome_grupo;
DROP INDEX IF EXISTS idx_lc131_codigo_nome_fonte;
DROP INDEX IF EXISTS idx_lc131_codigo_nome_elemento;
DROP INDEX IF EXISTS idx_lc131_codigo_nome_favorecido;
DROP INDEX IF EXISTS idx_tab_drs_municipio;
DROP INDEX IF EXISTS idx_tab_rras_municipio;

-- Verifica tamanho após DROPs
SELECT pg_size_pretty(pg_database_size(current_database())) AS tamanho_atual;
