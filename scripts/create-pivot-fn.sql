-- ================================================================
-- lc131_pivot: retorna JSON com pago_total / empenhado / liquidado
-- agrupado por (municipio, tipo_despesa, ano_referencia)
-- Retorna json (1 linha) → evita limite de 1000 linhas da REST API
-- Execute no Supabase SQL Editor antes de usar a aba "Pagamentos"
-- ================================================================

DROP FUNCTION IF EXISTS public.lc131_pivot(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT);
DROP FUNCTION IF EXISTS public.lc131_pivot(INT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT);

CREATE OR REPLACE FUNCTION public.lc131_pivot(
  p_ano           INT  DEFAULT NULL,
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
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = 0
AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(r ORDER BY r.municipio, r.tipo_despesa, r.ano_referencia), '[]'::json)
    FROM (
      SELECT
        COALESCE(d.municipio,    '')           AS municipio,
        COALESCE(d.tipo_despesa, '(Sem Tipo)') AS tipo_despesa,
        d.ano_referencia::INT                  AS ano_referencia,
        SUM(COALESCE(d.pago, 0) + COALESCE(d.pago_anos_anteriores, 0))::NUMERIC AS pago_total,
        SUM(COALESCE(d.empenhado,  0))::NUMERIC AS empenhado,
        SUM(COALESCE(d.liquidado,  0))::NUMERIC AS liquidado
      FROM public.lc131_despesas d
      WHERE (p_ano           IS NULL OR d.ano_referencia           = p_ano)
        AND (p_drs           IS NULL OR d.drs                    = ANY(string_to_array(p_drs,           '|')))
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
    ) r
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.lc131_pivot(INT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO anon, authenticated;

-- Índice composto para acelerar o GROUP BY do pivot
CREATE INDEX IF NOT EXISTS idx_lc131_pivot
  ON public.lc131_despesas (ano_referencia, municipio, tipo_despesa);

SELECT 'lc131_pivot (json) + idx_lc131_pivot criados com sucesso' AS status;

