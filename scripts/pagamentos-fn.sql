-- ================================================================
-- FUNÇÃO: lc131_pagamentos
-- Retorna dados agregados de pagamentos para o painel Pagamentos:
--   hierarquia: favorecido → fonte_simpl → tipo_custeio → rotulo
--   pivô: por ano_referencia
-- Execute no Supabase SQL Editor após post-import-fn.sql
-- ================================================================

CREATE OR REPLACE FUNCTION public.lc131_pagamentos(
  p_municipio TEXT DEFAULT NULL,
  p_drs       TEXT DEFAULT NULL,
  p_rras      TEXT DEFAULT NULL,
  p_ano       INTEGER DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE
  result json;
BEGIN
  WITH base AS (
    SELECT
      COALESCE(NULLIF(TRIM(codigo_nome_favorecido), ''), 'Sem Favorecido') AS favorecido,
      CASE
        WHEN codigo_nome_fonte_recurso ILIKE '%tesouro%'        THEN 'ESTADUAL'
        WHEN codigo_nome_fonte_recurso ILIKE '%federal%'
          OR codigo_nome_fonte_recurso ILIKE '%uni%o%'
          OR codigo_nome_fonte_recurso ILIKE '%fundo nacional%'
          OR codigo_nome_fonte_recurso ILIKE '%transfer%ncia%'
          OR codigo_nome_fonte_recurso ILIKE '%SUS%'            THEN 'FEDERAL'
        ELSE 'OUTROS'
      END                                                        AS fonte_simpl,
      CASE
        WHEN codigo_nome_grupo LIKE '3%' THEN 'CUSTEIO'
        WHEN codigo_nome_grupo LIKE '4%' THEN 'INVESTIMENTO'
        WHEN codigo_nome_grupo LIKE '1%' THEN 'PESSOAL'
        ELSE 'OUTROS'
      END                                                        AS tipo_custeio,
      COALESCE(NULLIF(TRIM(rotulo), ''), 'Sem Rótulo')           AS rotulo,
      ano_referencia,
      SUM(COALESCE(pago, 0) + COALESCE(pago_anos_anteriores, 0)) AS pago_total,
      SUM(COALESCE(empenhado, 0))                                AS empenhado,
      SUM(COALESCE(liquidado, 0))                                AS liquidado
    FROM public.lc131_despesas
    WHERE
      (p_municipio IS NULL OR municipio = p_municipio
         OR public.norm_munic(nome_municipio) = public.norm_munic(p_municipio))
      AND (p_drs  IS NULL OR drs  = p_drs)
      AND (p_rras IS NULL OR rras = p_rras)
      AND (p_ano  IS NULL OR ano_referencia = p_ano)
    GROUP BY 1, 2, 3, 4, 5
  )
  SELECT json_agg(
    json_build_object(
      'favorecido',      base.favorecido,
      'fonte_simpl',     base.fonte_simpl,
      'tipo_custeio',    base.tipo_custeio,
      'rotulo',          base.rotulo,
      'ano_referencia',  base.ano_referencia,
      'pago_total',      base.pago_total,
      'empenhado',       base.empenhado,
      'liquidado',       base.liquidado
    )
    ORDER BY base.favorecido, base.fonte_simpl, base.tipo_custeio, base.rotulo, base.ano_referencia
  )
  INTO result
  FROM base;

  RETURN COALESCE(result, '[]'::json);
END $$;

-- Permite acesso para todos os roles usados no frontend
GRANT EXECUTE ON FUNCTION public.lc131_pagamentos(TEXT, TEXT, TEXT, INTEGER)
  TO anon, authenticated, service_role;


-- ================================================================
-- FUNÇÃO auxiliar: lc131_municipios_list
-- Lista de municípios distintos para o dropdown do painel Pagamentos
-- ================================================================

CREATE OR REPLACE FUNCTION public.lc131_municipios_list()
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
SET statement_timeout = '30s'
AS $$
  SELECT json_agg(municipio ORDER BY municipio)
  FROM (
    SELECT DISTINCT municipio
    FROM public.lc131_despesas
    WHERE municipio IS NOT NULL AND municipio <> ''
  ) t;
$$;

GRANT EXECUTE ON FUNCTION public.lc131_municipios_list()
  TO anon, authenticated, service_role;
