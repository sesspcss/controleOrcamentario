-- ================================================================
-- lc131_pivot: retorna pago_total / empenhado / liquidado
-- agrupado por (municipio, rotulo, ano_referencia)
-- Todos os anos aparecem como colunas no front-end (pivot dinâmico)
-- Execute no Supabase SQL Editor antes de usar a aba "Pagamentos"
-- ================================================================

DROP FUNCTION IF EXISTS public.lc131_pivot(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT);

CREATE OR REPLACE FUNCTION public.lc131_pivot(
  p_drs           TEXT DEFAULT NULL,
  p_regiao_ad     TEXT DEFAULT NULL,
  p_rras          TEXT DEFAULT NULL,
  p_regiao_sa     TEXT DEFAULT NULL,
  p_municipio     TEXT DEFAULT NULL,
  p_grupo_despesa TEXT DEFAULT NULL,
  p_tipo_despesa  TEXT DEFAULT NULL,
  p_rotulo        TEXT DEFAULT NULL,
  p_uo            TEXT DEFAULT NULL,
  p_elemento      TEXT DEFAULT NULL,
  p_favorecido    TEXT DEFAULT NULL
)
RETURNS TABLE(
  municipio      TEXT,
  tipo_despesa   TEXT,
  ano_referencia INT,
  pago_total     NUMERIC,
  empenhado      NUMERIC,
  liquidado      NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = 0
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(d.municipio,    '')               AS municipio,
    COALESCE(d.tipo_despesa, '(Sem Tipo)')     AS tipo_despesa,
    d.ano_referencia::INT                      AS ano_referencia,
    SUM(COALESCE(d.pago, 0) + COALESCE(d.pago_anos_anteriores, 0)) AS pago_total,
    SUM(COALESCE(d.empenhado,  0))             AS empenhado,
    SUM(COALESCE(d.liquidado,  0))             AS liquidado
  FROM public.lc131_despesas d
  WHERE (p_drs           IS NULL OR d.drs                    = ANY(string_to_array(p_drs,           '|')))
    AND (p_regiao_ad     IS NULL OR d.regiao_ad              = ANY(string_to_array(p_regiao_ad,     '|')))
    AND (p_rras          IS NULL OR d.rras                   = ANY(string_to_array(p_rras,          '|')))
    AND (p_regiao_sa     IS NULL OR d.regiao_sa              = ANY(string_to_array(p_regiao_sa,     '|')))
    AND (p_municipio     IS NULL OR d.municipio              = ANY(string_to_array(p_municipio,     '|')))
    AND (p_grupo_despesa IS NULL OR d.codigo_nome_grupo      = ANY(string_to_array(p_grupo_despesa, '|')))
    AND (p_tipo_despesa  IS NULL OR d.tipo_despesa           = ANY(string_to_array(p_tipo_despesa,  '|')))
    AND (p_rotulo        IS NULL OR d.rotulo                 = ANY(string_to_array(p_rotulo,        '|')))
    AND (p_uo            IS NULL OR d.codigo_nome_uo         = ANY(string_to_array(p_uo,            '|')))
    AND (p_elemento      IS NULL OR d.codigo_nome_elemento   = ANY(string_to_array(p_elemento,      '|')))
    AND (p_favorecido    IS NULL OR d.codigo_nome_favorecido = ANY(string_to_array(p_favorecido,    '|')))
  GROUP BY d.municipio, d.tipo_despesa, d.ano_referencia
  ORDER BY d.municipio, d.tipo_despesa, d.ano_referencia;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lc131_pivot(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO anon, authenticated;

SELECT 'Função lc131_pivot criada com sucesso' AS status;
