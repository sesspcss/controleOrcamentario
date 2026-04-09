-- ================================================================
-- PARTE 2 de 4 — Adicionar colunas + popular dados enriquecidos
-- Execute DEPOIS da Parte 1
-- ================================================================
SET statement_timeout = 0;

-- Adicionar colunas de enriquecimento
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

-- Popular com JOINs (roda uma vez, ~2 min no free tier)
UPDATE public.lc131_despesas tgt
SET
  drs           = sub.e_drs,
  rras          = sub.e_rras,
  regiao_ad     = sub.e_regiao_ad,
  regiao_sa     = sub.e_regiao_sa,
  cod_ibge      = sub.e_cod_ibge,
  municipio     = sub.e_municipio,
  fonte_recurso = sub.e_fonte_recurso,
  grupo_despesa = sub.e_grupo_despesa,
  tipo_despesa  = sub.e_tipo_despesa,
  rotulo        = sub.e_rotulo,
  pago_total    = COALESCE(tgt.pago, 0) + COALESCE(tgt.pago_anos_anteriores, 0)
FROM (
  SELECT
    lc.id,
    NULLIF(TRIM(COALESCE(td.drs,  rb1.drs,  rb2.drs,  rb3.drs)),  '')  AS e_drs,
    NULLIF(TRIM(COALESCE(tr.rras, rb1.rras, rb2.rras, rb3.rras)), '')   AS e_rras,
    COALESCE(rb1.regiao_ad,     rb2.regiao_ad,     rb3.regiao_ad)       AS e_regiao_ad,
    COALESCE(rb1.regiao_sa,     rb2.regiao_sa,     rb3.regiao_sa)       AS e_regiao_sa,
    COALESCE(rb1.cod_ibge,      rb2.cod_ibge,      rb3.cod_ibge)        AS e_cod_ibge,
    COALESCE(lc.nome_municipio, rb1.municipio, rb2.municipio, rb3.municipio) AS e_municipio,
    COALESCE(rb1.fonte_recurso, rb2.fonte_recurso, rb3.fonte_recurso)   AS e_fonte_recurso,
    COALESCE(rb1.grupo_despesa, rb2.grupo_despesa, rb3.grupo_despesa)   AS e_grupo_despesa,
    COALESCE(rb1.tipo_despesa,  rb2.tipo_despesa,  rb3.tipo_despesa)    AS e_tipo_despesa,
    COALESCE(rb1.rotulo,        rb2.rotulo,        rb3.rotulo)          AS e_rotulo
  FROM public.lc131_despesas lc
  LEFT JOIN public.tab_drs  td  ON td.municipio = lc.nome_municipio
  LEFT JOIN public.tab_rras tr  ON tr.municipio = lc.nome_municipio
  LEFT JOIN public.bd_ref   rb1 ON rb1.codigo = lc.codigo_projeto_atividade::text
  LEFT JOIN public.bd_ref   rb2 ON rb2.codigo = lc.codigo_ug::text
  LEFT JOIN public.bd_ref   rb3 ON rb3.codigo = NULLIF(regexp_replace(
      split_part(lc.codigo_nome_ug::text, ' ', 1), '[^0-9]', '', 'g'), '')
) sub
WHERE tgt.id = sub.id;

-- Índice no DRS + VACUUM
CREATE INDEX IF NOT EXISTS idx_lc131_drs
  ON public.lc131_despesas (drs) WHERE drs IS NOT NULL AND drs <> '';

VACUUM public.lc131_despesas;

-- View de compatibilidade
CREATE OR REPLACE VIEW public.lc131_enriquecida AS
  SELECT * FROM public.lc131_despesas;

GRANT SELECT ON public.lc131_enriquecida TO anon, authenticated;
GRANT SELECT ON public.lc131_despesas    TO anon, authenticated;
GRANT SELECT ON public.bd_ref            TO anon, authenticated;

-- Verifica
SELECT pg_size_pretty(pg_database_size(current_database())) AS tamanho_atual;
SELECT COUNT(*) AS total, COUNT(drs) AS com_drs FROM public.lc131_despesas;
