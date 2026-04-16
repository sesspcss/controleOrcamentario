-- ================================================================
-- lc131_pivot v2.0: retorna JSON com pago_total / empenhado / liquidado
-- agrupado por dimensões configuráveis (p_dim / p_subdim)
-- Retorna json (1 linha) → evita limite de 1000 linhas da REST API
-- Execute no Supabase SQL Editor antes de usar a aba "Pagamentos"
--
-- Dimensões válidas para p_dim / p_subdim:
--   municipio | drs | rras | regiao_ad | regiao_sa |
--   grupo_despesa | elemento | rotulo | fonte_recurso | tipo_despesa
-- ================================================================

DROP FUNCTION IF EXISTS public.lc131_pivot(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT);
DROP FUNCTION IF EXISTS public.lc131_pivot(INT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT);
DROP FUNCTION IF EXISTS public.lc131_pivot(INT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT);
DROP FUNCTION IF EXISTS public.lc131_pivot(INT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT);

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
  p_fonte_recurso TEXT DEFAULT NULL,
  p_uo            TEXT DEFAULT NULL,
  p_elemento      TEXT DEFAULT NULL,
  p_favorecido    TEXT DEFAULT NULL,
  p_dim           TEXT DEFAULT 'municipio',
  p_subdim        TEXT DEFAULT 'tipo_despesa'
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = 0
AS $$
DECLARE
  v_dim    TEXT;
  v_subdim TEXT;
  v_sql    TEXT;
  v_result json;
BEGIN
  -- Whitelist column mapping — prevents SQL injection via p_dim / p_subdim
  v_dim := CASE COALESCE(p_dim, 'municipio')
    WHEN 'drs'           THEN 'd.drs'
    WHEN 'rras'          THEN 'd.rras'
    WHEN 'regiao_ad'     THEN 'd.regiao_ad'
    WHEN 'regiao_sa'     THEN 'd.regiao_sa'
    WHEN 'grupo_despesa' THEN 'd.codigo_nome_grupo'
    WHEN 'elemento'      THEN 'd.codigo_nome_elemento'
    WHEN 'rotulo'        THEN 'COALESCE(NULLIF(TRIM(d.rotulo),''''), d.codigo_nome_projeto_atividade, d.tipo_despesa)'
    WHEN 'fonte_recurso' THEN $fonteExpr$
      CASE
        WHEN d.tipo_despesa = 'TABELA SUS PAULISTA' THEN 'Tesouro'
        WHEN lower(d.codigo_nome_fonte_recurso) LIKE '%tesouro%' THEN 'Tesouro'
        WHEN lower(d.codigo_nome_fonte_recurso) LIKE '%fed%'
          OR lower(d.codigo_nome_fonte_recurso) LIKE '%uni%o%'
          OR lower(d.codigo_nome_fonte_recurso) LIKE '%fundo nacional%'
          OR lower(d.codigo_nome_fonte_recurso) LIKE '%transfer%ncia%'
          OR lower(d.codigo_nome_fonte_recurso) LIKE '%transferencia%'
          OR lower(d.codigo_nome_fonte_recurso) LIKE '%sus%' THEN 'Federal'
        ELSE 'Demais Fontes'
      END
    $fonteExpr$
    WHEN 'tipo_despesa'  THEN 'd.tipo_despesa'
    ELSE 'd.municipio'
  END;

  -- Same fonte_recurso simplification for subdim
  v_subdim := CASE COALESCE(p_subdim, 'tipo_despesa')
    WHEN 'municipio'     THEN 'd.municipio'
    WHEN 'drs'           THEN 'd.drs'
    WHEN 'rras'          THEN 'd.rras'
    WHEN 'regiao_ad'     THEN 'd.regiao_ad'
    WHEN 'regiao_sa'     THEN 'd.regiao_sa'
    WHEN 'grupo_despesa' THEN 'd.codigo_nome_grupo'
    WHEN 'elemento'      THEN 'd.codigo_nome_elemento'
    WHEN 'rotulo'        THEN 'COALESCE(NULLIF(TRIM(d.rotulo),''''), d.codigo_nome_projeto_atividade, d.tipo_despesa)'
    WHEN 'fonte_recurso' THEN $fonteExpr2$
      CASE
        WHEN d.tipo_despesa = 'TABELA SUS PAULISTA' THEN 'Tesouro'
        WHEN lower(d.codigo_nome_fonte_recurso) LIKE '%tesouro%' THEN 'Tesouro'
        WHEN lower(d.codigo_nome_fonte_recurso) LIKE '%fed%'
          OR lower(d.codigo_nome_fonte_recurso) LIKE '%uni%o%'
          OR lower(d.codigo_nome_fonte_recurso) LIKE '%fundo nacional%'
          OR lower(d.codigo_nome_fonte_recurso) LIKE '%transfer%ncia%'
          OR lower(d.codigo_nome_fonte_recurso) LIKE '%transferencia%'
          OR lower(d.codigo_nome_fonte_recurso) LIKE '%sus%' THEN 'Federal'
        ELSE 'Demais Fontes'
      END
    $fonteExpr2$
    ELSE 'd.tipo_despesa'
  END;

  v_sql :=
    'SELECT COALESCE(json_agg(r ORDER BY r.dim1, r.subdim, r.ano_referencia), ''[]''::json) ' ||
    'FROM ( ' ||
    '  SELECT ' ||
    '    COALESCE(' || v_dim    || ', '''')              AS dim1, ' ||
    '    COALESCE(NULLIF(TRIM(' || v_subdim || '),''''), ''(Sem Dado)'') AS subdim, ' ||
    '    d.ano_referencia::INT                           AS ano_referencia, ' ||
    '    SUM(COALESCE(d.pago, 0) + COALESCE(d.pago_anos_anteriores, 0))::NUMERIC AS pago_total, ' ||
    '    SUM(COALESCE(d.empenhado,  0))::NUMERIC         AS empenhado, ' ||
    '    SUM(COALESCE(d.liquidado,  0))::NUMERIC         AS liquidado ' ||
    '  FROM public.lc131_despesas d ' ||
    '  WHERE ($1  IS NULL OR d.ano_referencia           = $1) ' ||
    '    AND ($2  IS NULL OR d.drs                    = ANY(string_to_array($2,  ''|''))) ' ||
    '    AND ($3  IS NULL OR d.regiao_ad              = ANY(string_to_array($3,  ''|''))) ' ||
    '    AND ($4  IS NULL OR d.rras                   = ANY(string_to_array($4,  ''|''))) ' ||
    '    AND ($5  IS NULL OR d.regiao_sa              = ANY(string_to_array($5,  ''|''))) ' ||
    '    AND ($6  IS NULL OR d.municipio              = ANY(string_to_array($6,  ''|''))) ' ||
    '    AND ($7  IS NULL OR d.codigo_nome_grupo      = ANY(string_to_array($7,  ''|''))) ' ||
    '    AND ($8  IS NULL OR d.tipo_despesa           = ANY(string_to_array($8,  ''|''))) ' ||
    '    AND ($9  IS NULL OR d.rotulo                 = ANY(string_to_array($9,  ''|''))) ' ||
    '    AND ($10 IS NULL OR (CASE ' ||
    '          WHEN d.tipo_despesa = ''TABELA SUS PAULISTA'' THEN ''Tesouro'' ' ||
    '          WHEN lower(d.codigo_nome_fonte_recurso) LIKE ''%tesouro%'' THEN ''Tesouro'' ' ||
    '          WHEN lower(d.codigo_nome_fonte_recurso) LIKE ''%fed%'' ' ||
    '            OR lower(d.codigo_nome_fonte_recurso) LIKE ''%uni%o%'' ' ||
    '            OR lower(d.codigo_nome_fonte_recurso) LIKE ''%fundo nacional%'' ' ||
    '            OR lower(d.codigo_nome_fonte_recurso) LIKE ''%transfer%ncia%'' ' ||
    '            OR lower(d.codigo_nome_fonte_recurso) LIKE ''%transferencia%'' ' ||
    '            OR lower(d.codigo_nome_fonte_recurso) LIKE ''%sus%'' THEN ''Federal'' ' ||
    '          ELSE ''Demais Fontes'' END) = ANY(string_to_array($10, ''|''))) ' ||
    '    AND ($11 IS NULL OR d.codigo_nome_uo         = ANY(string_to_array($11, ''|''))) ' ||
    '    AND ($12 IS NULL OR d.codigo_nome_elemento   = ANY(string_to_array($12, ''|''))) ' ||
    '    AND ($13 IS NULL OR d.codigo_nome_favorecido = ANY(string_to_array($13, ''|''))) ' ||
    '  GROUP BY 1, 2, d.ano_referencia ' ||
    ') r';

  EXECUTE v_sql INTO v_result
    USING p_ano, p_drs, p_regiao_ad, p_rras, p_regiao_sa, p_municipio,
          p_grupo_despesa, p_tipo_despesa, p_rotulo, p_fonte_recurso, p_uo, p_elemento, p_favorecido;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lc131_pivot(INT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO anon, authenticated;

-- Índices para acelerar GROUP BY nas dimensões mais usadas
CREATE INDEX IF NOT EXISTS idx_lc131_pivot
  ON public.lc131_despesas (ano_referencia, municipio, tipo_despesa);

CREATE INDEX IF NOT EXISTS idx_lc131_pivot_drs
  ON public.lc131_despesas (ano_referencia, drs, tipo_despesa);

CREATE INDEX IF NOT EXISTS idx_lc131_pivot_rras
  ON public.lc131_despesas (ano_referencia, rras, tipo_despesa);

CREATE INDEX IF NOT EXISTS idx_lc131_pivot_grupo
  ON public.lc131_despesas (ano_referencia, codigo_nome_grupo, tipo_despesa);

SELECT 'lc131_pivot v2.0 (dimensões configuráveis: p_dim / p_subdim) criada com sucesso' AS status;

