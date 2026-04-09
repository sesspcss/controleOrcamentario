-- ================================================================
-- COMPACTAR 3/5 — DROP tabela antiga + RENAME nova
-- ESTA É A AÇÃO MAIS IMPORTANTE: libera ~700 MB de uma vez
-- ================================================================
SET statement_timeout = 0;

-- Drop funções que referenciam lc131_despesas
DROP FUNCTION IF EXISTS public.lc131_dashboard(integer,text,text,text,text,text,text,text,text,text,text,text,text,text);
DROP FUNCTION IF EXISTS public.lc131_distincts(integer,text,text,text,text,text,text,text,text,text,text,text,text,text);
DROP FUNCTION IF EXISTS public.lc131_detail(integer,text,text,text,text,text,text,text,text,text,text,text,text,text,integer,integer);
DROP FUNCTION IF EXISTS public.refresh_dashboard();

-- Drop view que referencia lc131_despesas
DROP VIEW IF EXISTS public.lc131_enriquecida CASCADE;

-- DROP a tabela velha (bloated com dead tuples, ~700+ MB)
DROP TABLE IF EXISTS public.lc131_despesas CASCADE;

-- RENAME a compacta para o nome original
ALTER TABLE public.lc131_compact RENAME TO lc131_despesas;

-- Criar sequence para novos inserts
CREATE SEQUENCE IF NOT EXISTS public.lc131_despesas_id_seq;
SELECT setval('public.lc131_despesas_id_seq', (SELECT COALESCE(MAX(id), 0) FROM public.lc131_despesas));
ALTER TABLE public.lc131_despesas ALTER COLUMN id SET DEFAULT nextval('public.lc131_despesas_id_seq');

-- Índices mínimos
CREATE INDEX IF NOT EXISTS idx_lc131_ano
  ON public.lc131_despesas (ano_referencia);
CREATE INDEX IF NOT EXISTS idx_lc131_drs
  ON public.lc131_despesas (drs) WHERE drs IS NOT NULL AND drs <> '';

-- Grants + RLS
GRANT SELECT, INSERT ON public.lc131_despesas TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.lc131_despesas_id_seq TO anon, authenticated;
ALTER TABLE public.lc131_despesas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_read_lc131 ON public.lc131_despesas;
CREATE POLICY anon_read_lc131 ON public.lc131_despesas FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS anon_insert_lc131 ON public.lc131_despesas;
CREATE POLICY anon_insert_lc131 ON public.lc131_despesas FOR INSERT TO anon WITH CHECK (true);

-- View de compatibilidade
CREATE OR REPLACE VIEW public.lc131_enriquecida AS SELECT * FROM public.lc131_despesas;
GRANT SELECT ON public.lc131_enriquecida TO anon, authenticated;

SELECT pg_size_pretty(pg_database_size(current_database())) AS tamanho_atual;
SELECT COUNT(*) AS total FROM public.lc131_despesas;
