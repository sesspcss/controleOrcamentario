-- ================================================================
-- PARTE 2a — Adicionar colunas (instantâneo, sem dados)
-- ================================================================
SET statement_timeout = 0;

ALTER TABLE public.lc131_despesas ADD COLUMN IF NOT EXISTS drs           text;
ALTER TABLE public.lc131_despesas ADD COLUMN IF NOT EXISTS rras          text;
ALTER TABLE public.lc131_despesas ADD COLUMN IF NOT EXISTS regiao_ad     text;
ALTER TABLE public.lc131_despesas ADD COLUMN IF NOT EXISTS regiao_sa     text;
ALTER TABLE public.lc131_despesas ADD COLUMN IF NOT EXISTS cod_ibge      text;
ALTER TABLE public.lc131_despesas ADD COLUMN IF NOT EXISTS municipio     text;
ALTER TABLE public.lc131_despesas ADD COLUMN IF NOT EXISTS fonte_recurso text;
ALTER TABLE public.lc131_despesas ADD COLUMN IF NOT EXISTS grupo_despesa text;
ALTER TABLE public.lc131_despesas ADD COLUMN IF NOT EXISTS tipo_despesa  text;
ALTER TABLE public.lc131_despesas ADD COLUMN IF NOT EXISTS rotulo        text;
ALTER TABLE public.lc131_despesas ADD COLUMN IF NOT EXISTS pago_total    numeric;

SELECT 'Colunas adicionadas' AS status;
