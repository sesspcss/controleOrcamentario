-- ================================================================
-- PATCH: Tipo de Despesa usa tipo_despesa_classif (classify_tipo_despesa)
-- Atualiza as 3 funÃ§Ãµes: lc131_dashboard, lc131_distincts, lc131_detail
-- Rodar no Supabase SQL Editor (uma vez)
-- ================================================================
SET statement_timeout = 0;

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 1. lc131_dashboard
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE OR REPLACE FUNCTION public.lc131_dashboard(
  p_ano           integer DEFAULT NULL,
  p_drs           text    DEFAULT NULL,
  p_regiao_ad     text    DEFAULT NULL,
  p_rras          text    DEFAULT NULL,
  p_regiao_sa     text    DEFAULT NULL,
  p_municipio     text    DEFAULT NULL,
  p_grupo_despesa text    DEFAULT NULL,
  p_tipo_despesa  text    DEFAULT NULL,
  p_rotulo        text    DEFAULT NULL,
  p_fonte_recurso text    DEFAULT NULL,
  p_codigo_ug     text    DEFAULT NULL,
  p_uo            text    DEFAULT NULL,
  p_elemento      text    DEFAULT NULL,
  p_favorecido    text    DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public SET statement_timeout = 0
AS $$
DECLARE result json;
BEGIN
  WITH base AS (
    SELECT
      ano_referencia,
      drs, regiao_ad, rras, regiao_sa, municipio,
      codigo_nome_grupo, codigo_nome_fonte_recurso,
      codigo_nome_elemento, codigo_nome_uo, codigo_ug,
      rotulo,
      descricao_processo,
      tipo_despesa_classif,
      codigo_nome_favorecido, codigo_nome_projeto_atividade,
      codigo_nome_ug,
      COALESCE(empenhado, 0) AS empenhado,
      COALESCE(liquidado, 0) AS liquidado,
      COALESCE(pago, 0)      AS pago,
      COALESCE(pago, 0) + COALESCE(pago_anos_anteriores, 0) AS _pt,
      CASE
        WHEN LEFT(codigo_nome_grupo, 1) = '1' THEN 'Pessoal'
        WHEN LEFT(codigo_nome_grupo, 1) = '2' THEN 'DÃ­vida'
        WHEN LEFT(codigo_nome_grupo, 1) = '3' THEN 'Custeio'
        WHEN LEFT(codigo_nome_grupo, 1) = '4' THEN 'Investimento'
        ELSE 'Outros'
      END AS _gs,
      CASE
        WHEN codigo_nome_fonte_recurso ILIKE '%tesouro%' THEN 'Tesouro'
        WHEN codigo_nome_fonte_recurso ILIKE '%fed%'
          OR codigo_nome_fonte_recurso ILIKE '%uniÃ£o%'
          OR codigo_nome_fonte_recurso ILIKE '%uniao%'
          OR codigo_nome_fonte_recurso ILIKE '%fundo nacional%'
          OR codigo_nome_fonte_recurso ILIKE '%transferÃªncia%'
          OR codigo_nome_fonte_recurso ILIKE '%transferencia%'
          OR codigo_nome_fonte_recurso ILIKE '%SUS%' THEN 'Federal'
        ELSE 'Demais Fontes'
      END AS _fs
    FROM lc131_despesas
    WHERE
      (p_ano IS NULL OR ano_referencia = p_ano)
      AND (p_drs           IS NULL OR drs                       = ANY(string_to_array(p_drs, '|')))
      AND (p_regiao_ad     IS NULL OR regiao_ad                 = ANY(string_to_array(p_regiao_ad, '|')))
      AND (p_rras          IS NULL OR rras                      = ANY(string_to_array(p_rras, '|')))
      AND (p_regiao_sa     IS NULL OR regiao_sa                 = ANY(string_to_array(p_regiao_sa, '|')))
      AND (p_municipio     IS NULL OR municipio                 = ANY(string_to_array(p_municipio, '|')))
      AND (p_grupo_despesa IS NULL OR codigo_nome_grupo         = ANY(string_to_array(p_grupo_despesa, '|')))
      AND (p_tipo_despesa  IS NULL OR tipo_despesa_classif      = ANY(string_to_array(p_tipo_despesa, '|')))
      AND (p_rotulo        IS NULL OR rotulo                    = ANY(string_to_array(p_rotulo, '|')))
      AND (p_fonte_recurso IS NULL OR (
            CASE
              WHEN codigo_nome_fonte_recurso ILIKE '%tesouro%' THEN 'Tesouro'
              WHEN codigo_nome_fonte_recurso ILIKE '%fed%'
                OR codigo_nome_fonte_recurso ILIKE '%uniÃ£o%'
                OR codigo_nome_fonte_recurso ILIKE '%uniao%'
                OR codigo_nome_fonte_recurso ILIKE '%fundo nacional%'
                OR codigo_nome_fonte_recurso ILIKE '%transferÃªncia%'
                OR codigo_nome_fonte_recurso ILIKE '%transferencia%'
                OR codigo_nome_fonte_recurso ILIKE '%SUS%' THEN 'Federal'
              ELSE 'Demais Fontes'
            END) = ANY(string_to_array(p_fonte_recurso, '|')))
      AND (p_codigo_ug     IS NULL OR codigo_ug::text           = ANY(string_to_array(p_codigo_ug, '|')))
      AND (p_uo            IS NULL OR codigo_nome_uo            = ANY(string_to_array(p_uo, '|')))
      AND (p_elemento      IS NULL OR codigo_nome_elemento      = ANY(string_to_array(p_elemento, '|')))
      AND (p_favorecido    IS NULL OR codigo_nome_favorecido    = ANY(string_to_array(p_favorecido, '|')))
  )
  SELECT json_build_object(
    'kpis', (
      SELECT json_build_object(
        'empenhado',  SUM(empenhado),
        'liquidado',  SUM(liquidado),
        'pago',       SUM(pago),
        'pago_total', SUM(_pt),
        'total',      COUNT(*),
        'municipios', COUNT(DISTINCT NULLIF(municipio, ''))
      ) FROM base
    ),
    'por_ano', (
      SELECT json_agg(r ORDER BY r.ano) FROM (
        SELECT ano_referencia::int AS ano,
          SUM(empenhado) AS empenhado, SUM(liquidado) AS liquidado,
          SUM(pago) AS pago, SUM(_pt) AS pago_total, COUNT(*) AS registros
        FROM base WHERE ano_referencia IS NOT NULL GROUP BY ano_referencia
      ) r
    ),
    'por_grupo_simpl', (
      SELECT json_agg(r ORDER BY r.empenhado DESC) FROM (
        SELECT _gs AS grupo_simpl,
          SUM(empenhado) AS empenhado, SUM(liquidado) AS liquidado, SUM(_pt) AS pago_total
        FROM base WHERE codigo_nome_grupo IS NOT NULL AND codigo_nome_grupo<>''
        GROUP BY _gs
      ) r
    ),
    'por_fonte_simpl', (
      SELECT json_agg(r ORDER BY r.empenhado DESC) FROM (
        SELECT _fs AS fonte_simpl,
          SUM(empenhado) AS empenhado, SUM(liquidado) AS liquidado, SUM(_pt) AS pago_total
        FROM base WHERE codigo_nome_fonte_recurso IS NOT NULL AND codigo_nome_fonte_recurso<>''
        GROUP BY _fs
      ) r
    ),
    'por_grupo', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_grupo AS grupo_despesa,
          SUM(empenhado) AS empenhado, SUM(liquidado) AS liquidado, SUM(_pt) AS pago_total
        FROM base WHERE codigo_nome_grupo IS NOT NULL AND codigo_nome_grupo<>''
        GROUP BY codigo_nome_grupo ORDER BY 2 DESC LIMIT 12
      ) r
    ),
    'por_drs', (
      SELECT json_agg(r) FROM (
        SELECT drs,
          SUM(empenhado) AS empenhado, SUM(liquidado) AS liquidado, SUM(_pt) AS pago_total
        FROM base WHERE drs IS NOT NULL AND drs<>''
        GROUP BY drs ORDER BY 2 DESC LIMIT 20
      ) r
    ),
    'por_municipio', (
      SELECT json_agg(r) FROM (
        SELECT municipio,
          SUM(empenhado) AS empenhado, SUM(_pt) AS pago_total
        FROM base WHERE municipio IS NOT NULL AND municipio<>''
        GROUP BY municipio ORDER BY 2 DESC LIMIT 15
      ) r
    ),
    'por_fonte', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_fonte_recurso AS fonte_recurso,
          SUM(empenhado) AS empenhado, SUM(_pt) AS pago_total
        FROM base WHERE codigo_nome_fonte_recurso IS NOT NULL AND codigo_nome_fonte_recurso<>''
        GROUP BY codigo_nome_fonte_recurso ORDER BY 2 DESC LIMIT 12
      ) r
    ),
    'por_elemento', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_elemento AS elemento,
          SUM(empenhado) AS empenhado, SUM(_pt) AS pago_total
        FROM base WHERE codigo_nome_elemento IS NOT NULL AND codigo_nome_elemento<>''
        GROUP BY codigo_nome_elemento ORDER BY 2 DESC LIMIT 12
      ) r
    ),
    'por_regiao_ad', (
      SELECT json_agg(r) FROM (
        SELECT regiao_ad,
          SUM(empenhado) AS empenhado, SUM(_pt) AS pago_total
        FROM base WHERE regiao_ad IS NOT NULL AND regiao_ad<>''
        GROUP BY regiao_ad ORDER BY 2 DESC LIMIT 20
      ) r
    ),
    'por_uo', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_uo AS uo,
          SUM(empenhado) AS empenhado, SUM(liquidado) AS liquidado, SUM(_pt) AS pago_total
        FROM base WHERE codigo_nome_uo IS NOT NULL AND codigo_nome_uo<>''
        GROUP BY codigo_nome_uo ORDER BY 2 DESC LIMIT 15
      ) r
    ),
    'por_rras', (
      SELECT json_agg(r) FROM (
        SELECT rras,
          SUM(empenhado) AS empenhado, SUM(liquidado) AS liquidado, SUM(_pt) AS pago_total
        FROM base WHERE rras IS NOT NULL AND rras<>''
        GROUP BY rras ORDER BY 2 DESC LIMIT 20
      ) r
    ),
    'por_tipo_despesa', (
      SELECT json_agg(r) FROM (
        SELECT tipo_despesa_classif AS tipo_despesa,
          SUM(empenhado) AS empenhado, SUM(liquidado) AS liquidado, SUM(_pt) AS pago_total
        FROM base WHERE tipo_despesa_classif IS NOT NULL AND tipo_despesa_classif<>''
        GROUP BY tipo_despesa_classif ORDER BY 2 DESC LIMIT 60
      ) r
    ),
    'por_rotulo', (
      SELECT json_agg(r) FROM (
        SELECT rotulo,
          SUM(empenhado) AS empenhado, SUM(_pt) AS pago_total
        FROM base WHERE rotulo IS NOT NULL AND rotulo<>''
        GROUP BY rotulo ORDER BY 2 DESC LIMIT 12
      ) r
    ),
    'por_favorecido', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_favorecido AS favorecido,
          SUM(empenhado) AS empenhado, SUM(_pt) AS pago_total, COUNT(*) AS contratos
        FROM base WHERE codigo_nome_favorecido IS NOT NULL AND codigo_nome_favorecido<>''
        GROUP BY codigo_nome_favorecido ORDER BY 2 DESC LIMIT 20
      ) r
    ),
    'por_projeto', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_projeto_atividade AS projeto,
          SUM(empenhado) AS empenhado, SUM(_pt) AS pago_total, COUNT(*) AS registros
        FROM base WHERE codigo_nome_projeto_atividade IS NOT NULL AND codigo_nome_projeto_atividade<>''
        GROUP BY codigo_nome_projeto_atividade ORDER BY 2 DESC LIMIT 20
      ) r
    ),
    'por_ug', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_ug AS ug,
          SUM(empenhado) AS empenhado, SUM(_pt) AS pago_total
        FROM base WHERE codigo_nome_ug IS NOT NULL AND codigo_nome_ug<>''
        GROUP BY codigo_nome_ug ORDER BY 2 DESC LIMIT 15
      ) r
    ),
    'por_regiao_sa', (
      SELECT json_agg(r) FROM (
        SELECT regiao_sa,
          SUM(empenhado) AS empenhado, SUM(_pt) AS pago_total
        FROM base WHERE regiao_sa IS NOT NULL AND regiao_sa<>''
        GROUP BY regiao_sa ORDER BY 2 DESC LIMIT 20
      ) r
    )
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lc131_dashboard(integer,text,text,text,text,text,text,text,text,text,text,text,text,text) TO anon, authenticated;


-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 2. lc131_distincts
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE OR REPLACE FUNCTION public.lc131_distincts(
  p_ano           integer DEFAULT NULL,
  p_drs           text    DEFAULT NULL,
  p_regiao_ad     text    DEFAULT NULL,
  p_rras          text    DEFAULT NULL,
  p_regiao_sa     text    DEFAULT NULL,
  p_municipio     text    DEFAULT NULL,
  p_grupo_despesa text    DEFAULT NULL,
  p_tipo_despesa  text    DEFAULT NULL,
  p_rotulo        text    DEFAULT NULL,
  p_fonte_recurso text    DEFAULT NULL,
  p_codigo_ug     text    DEFAULT NULL,
  p_uo            text    DEFAULT NULL,
  p_elemento      text    DEFAULT NULL,
  p_favorecido    text    DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public SET statement_timeout = 0
AS $$
DECLARE result json;
BEGIN
  WITH filtered AS (
    SELECT drs, regiao_ad, rras, regiao_sa, municipio,
           codigo_nome_grupo, rotulo,
           descricao_processo,
           tipo_despesa,
           tipo_despesa_classif,
           codigo_nome_fonte_recurso, codigo_ug,
           codigo_nome_uo, codigo_nome_elemento,
           codigo_nome_favorecido
    FROM lc131_despesas
    WHERE
      (p_ano IS NULL OR ano_referencia = p_ano)
      AND (p_drs           IS NULL OR drs                       = ANY(string_to_array(p_drs, '|')))
      AND (p_regiao_ad     IS NULL OR regiao_ad                 = ANY(string_to_array(p_regiao_ad, '|')))
      AND (p_rras          IS NULL OR rras                      = ANY(string_to_array(p_rras, '|')))
      AND (p_regiao_sa     IS NULL OR regiao_sa                 = ANY(string_to_array(p_regiao_sa, '|')))
      AND (p_municipio     IS NULL OR municipio                 = ANY(string_to_array(p_municipio, '|')))
      AND (p_grupo_despesa IS NULL OR codigo_nome_grupo         = ANY(string_to_array(p_grupo_despesa, '|')))
      AND (p_tipo_despesa  IS NULL OR tipo_despesa_classif      = ANY(string_to_array(p_tipo_despesa, '|')))
      AND (p_rotulo        IS NULL OR rotulo                    = ANY(string_to_array(p_rotulo, '|')))
      AND (p_fonte_recurso IS NULL OR (
            CASE
              WHEN codigo_nome_fonte_recurso ILIKE '%tesouro%' THEN 'Tesouro'
              WHEN codigo_nome_fonte_recurso ILIKE '%fed%'
                OR codigo_nome_fonte_recurso ILIKE '%uniÃ£o%'
                OR codigo_nome_fonte_recurso ILIKE '%uniao%'
                OR codigo_nome_fonte_recurso ILIKE '%fundo nacional%'
                OR codigo_nome_fonte_recurso ILIKE '%transferÃªncia%'
                OR codigo_nome_fonte_recurso ILIKE '%transferencia%'
                OR codigo_nome_fonte_recurso ILIKE '%SUS%' THEN 'Federal'
              ELSE 'Demais Fontes'
            END) = ANY(string_to_array(p_fonte_recurso, '|')))
      AND (p_codigo_ug     IS NULL OR codigo_ug::text           = ANY(string_to_array(p_codigo_ug, '|')))
      AND (p_uo            IS NULL OR codigo_nome_uo            = ANY(string_to_array(p_uo, '|')))
      AND (p_elemento      IS NULL OR codigo_nome_elemento      = ANY(string_to_array(p_elemento, '|')))
      AND (p_favorecido    IS NULL OR codigo_nome_favorecido    = ANY(string_to_array(p_favorecido, '|')))
  )
  SELECT json_build_object(
    'distinct_drs',        (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT drs                       AS d FROM filtered WHERE drs IS NOT NULL AND drs<>'') x),
    'distinct_regiao_ad',  (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT regiao_ad                 AS d FROM filtered WHERE regiao_ad IS NOT NULL AND regiao_ad<>'') x),
    'distinct_rras',       (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT rras                      AS d FROM filtered WHERE rras IS NOT NULL AND rras<>'') x),
    'distinct_regiao_sa',  (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT regiao_sa                 AS d FROM filtered WHERE regiao_sa IS NOT NULL AND regiao_sa<>'') x),
    'distinct_municipio',  (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT municipio                 AS d FROM filtered WHERE municipio IS NOT NULL AND municipio<>'') x),
    'distinct_grupo',      (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT codigo_nome_grupo         AS d FROM filtered WHERE codigo_nome_grupo IS NOT NULL AND codigo_nome_grupo<>'') x),
    'distinct_tipo',       (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT tipo_despesa_classif AS d FROM filtered WHERE tipo_despesa_classif IS NOT NULL AND tipo_despesa_classif<>'') x),
    'distinct_rotulo',     (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT rotulo                    AS d FROM filtered WHERE rotulo IS NOT NULL AND rotulo<>'') x),
    'distinct_fonte',      (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT
                              CASE
                                WHEN codigo_nome_fonte_recurso ILIKE '%tesouro%' THEN 'Tesouro'
                                WHEN codigo_nome_fonte_recurso ILIKE '%fed%'
                                  OR codigo_nome_fonte_recurso ILIKE '%uniÃ£o%'
                                  OR codigo_nome_fonte_recurso ILIKE '%uniao%'
                                  OR codigo_nome_fonte_recurso ILIKE '%fundo nacional%'
                                  OR codigo_nome_fonte_recurso ILIKE '%transferÃªncia%'
                                  OR codigo_nome_fonte_recurso ILIKE '%transferencia%'
                                  OR codigo_nome_fonte_recurso ILIKE '%SUS%' THEN 'Federal'
                                ELSE 'Demais Fontes'
                              END AS d
                            FROM filtered WHERE codigo_nome_fonte_recurso IS NOT NULL AND codigo_nome_fonte_recurso<>'') x),
    'distinct_codigo_ug',  (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT codigo_ug::text           AS d FROM filtered WHERE codigo_ug IS NOT NULL) x),
    'distinct_uo',         (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT codigo_nome_uo            AS d FROM filtered WHERE codigo_nome_uo IS NOT NULL AND codigo_nome_uo<>'') x),
    'distinct_elemento',   (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT codigo_nome_elemento      AS d FROM filtered WHERE codigo_nome_elemento IS NOT NULL AND codigo_nome_elemento<>'') x),
    'distinct_favorecido', (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT codigo_nome_favorecido    AS d FROM filtered WHERE codigo_nome_favorecido IS NOT NULL AND codigo_nome_favorecido<>'') x)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lc131_distincts(integer,text,text,text,text,text,text,text,text,text,text,text,text,text) TO anon, authenticated;


-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 3. lc131_detail
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE OR REPLACE FUNCTION public.lc131_detail(
  p_ano           integer DEFAULT NULL,
  p_drs           text    DEFAULT NULL,
  p_regiao_ad     text    DEFAULT NULL,
  p_rras          text    DEFAULT NULL,
  p_regiao_sa     text    DEFAULT NULL,
  p_municipio     text    DEFAULT NULL,
  p_grupo_despesa text    DEFAULT NULL,
  p_tipo_despesa  text    DEFAULT NULL,
  p_rotulo        text    DEFAULT NULL,
  p_fonte_recurso text    DEFAULT NULL,
  p_codigo_ug     text    DEFAULT NULL,
  p_uo            text    DEFAULT NULL,
  p_elemento      text    DEFAULT NULL,
  p_favorecido    text    DEFAULT NULL,
  p_limit         integer DEFAULT 200,
  p_offset        integer DEFAULT 0
)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public SET statement_timeout = 0
AS $$
DECLARE result json;
BEGIN
  WITH filtered AS (
    SELECT *,
           COALESCE(pago, 0) + COALESCE(pago_anos_anteriores, 0) AS _pt,
           CASE
             WHEN codigo_nome_fonte_recurso ILIKE '%tesouro%' THEN 'Tesouro'
             WHEN codigo_nome_fonte_recurso ILIKE '%fed%'
               OR codigo_nome_fonte_recurso ILIKE '%uniÃ£o%'
               OR codigo_nome_fonte_recurso ILIKE '%uniao%'
               OR codigo_nome_fonte_recurso ILIKE '%fundo nacional%'
               OR codigo_nome_fonte_recurso ILIKE '%transferÃªncia%'
               OR codigo_nome_fonte_recurso ILIKE '%transferencia%'
               OR codigo_nome_fonte_recurso ILIKE '%SUS%' THEN 'Federal'
             ELSE 'Demais Fontes'
           END AS fonte_simpl,
           CASE
             WHEN LEFT(codigo_nome_grupo, 1) = '1' THEN 'Pessoal'
             WHEN LEFT(codigo_nome_grupo, 1) = '2' THEN 'DÃ­vida'
             WHEN LEFT(codigo_nome_grupo, 1) = '3' THEN 'Custeio'
             WHEN LEFT(codigo_nome_grupo, 1) = '4' THEN 'Investimento'
             ELSE 'Outros'
           END AS grupo_simpl
    FROM lc131_despesas
    WHERE
      (p_ano IS NULL OR ano_referencia = p_ano)
      AND (p_drs           IS NULL OR drs                       = ANY(string_to_array(p_drs, '|')))
      AND (p_regiao_ad     IS NULL OR regiao_ad                 = ANY(string_to_array(p_regiao_ad, '|')))
      AND (p_rras          IS NULL OR rras                      = ANY(string_to_array(p_rras, '|')))
      AND (p_regiao_sa     IS NULL OR regiao_sa                 = ANY(string_to_array(p_regiao_sa, '|')))
      AND (p_municipio     IS NULL OR municipio                 = ANY(string_to_array(p_municipio, '|')))
      AND (p_grupo_despesa IS NULL OR codigo_nome_grupo         = ANY(string_to_array(p_grupo_despesa, '|')))
      AND (p_tipo_despesa  IS NULL OR tipo_despesa_classif      = ANY(string_to_array(p_tipo_despesa, '|')))
      AND (p_rotulo        IS NULL OR rotulo                    = ANY(string_to_array(p_rotulo, '|')))
      AND (p_fonte_recurso IS NULL OR (
            CASE
              WHEN codigo_nome_fonte_recurso ILIKE '%tesouro%' THEN 'Tesouro'
              WHEN codigo_nome_fonte_recurso ILIKE '%fed%'
                OR codigo_nome_fonte_recurso ILIKE '%uniÃ£o%'
                OR codigo_nome_fonte_recurso ILIKE '%uniao%'
                OR codigo_nome_fonte_recurso ILIKE '%fundo nacional%'
                OR codigo_nome_fonte_recurso ILIKE '%transferÃªncia%'
                OR codigo_nome_fonte_recurso ILIKE '%transferencia%'
                OR codigo_nome_fonte_recurso ILIKE '%SUS%' THEN 'Federal'
              ELSE 'Demais Fontes'
            END) = ANY(string_to_array(p_fonte_recurso, '|')))
      AND (p_codigo_ug     IS NULL OR codigo_ug::text           = ANY(string_to_array(p_codigo_ug, '|')))
      AND (p_uo            IS NULL OR codigo_nome_uo            = ANY(string_to_array(p_uo, '|')))
      AND (p_elemento      IS NULL OR codigo_nome_elemento      = ANY(string_to_array(p_elemento, '|')))
      AND (p_favorecido    IS NULL OR codigo_nome_favorecido    = ANY(string_to_array(p_favorecido, '|')))
  )
  SELECT json_build_object(
    'total', (SELECT COUNT(*) FROM filtered),
    'rows',  (
      SELECT json_agg(r) FROM (
        SELECT
          id, ano_referencia,
          drs, regiao_ad, rras, regiao_sa, cod_ibge, municipio,
          codigo_nome_uo, codigo_nome_ug, codigo_ug,
          codigo_nome_projeto_atividade, codigo_projeto_atividade,
          codigo_nome_fonte_recurso, fonte_recurso, fonte_simpl,
          codigo_nome_grupo, grupo_despesa, grupo_simpl,
          codigo_nome_elemento, codigo_elemento,
          tipo_despesa_classif AS tipo_despesa, rotulo,
          unidade,
          codigo_nome_favorecido, codigo_favorecido,
          descricao_processo, numero_processo,
          empenhado, liquidado, pago, pago_anos_anteriores, _pt AS pago_total
        FROM filtered
        ORDER BY empenhado DESC NULLS LAST
        LIMIT p_limit OFFSET p_offset
      ) r
    )
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lc131_detail(integer,text,text,text,text,text,text,text,text,text,text,text,text,text,integer,integer) TO anon, authenticated;


-- Recarregar schema do PostgREST
NOTIFY pgrst, 'reload schema';
