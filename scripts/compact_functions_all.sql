-- ================================================================
-- COMPACTAR — Todas as funções (substitui compact4 + compact5)
-- Inclui agrupamentos simplificados: Grupo (Custeio/Investimento/Pessoal)
-- e Fonte (Tesouro/Federal/Demais Fontes)
-- ================================================================
SET statement_timeout = 0;

-- ───────────────────────────────────────────────────────────────
-- 1. lc131_dashboard — retorna KPIs + 18 agregações
-- ───────────────────────────────────────────────────────────────
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
      tipo_despesa, rotulo,
      codigo_nome_favorecido, codigo_nome_projeto_atividade,
      codigo_nome_ug,
      COALESCE(empenhado, 0) AS empenhado,
      COALESCE(liquidado, 0) AS liquidado,
      COALESCE(pago, 0)      AS pago,
      COALESCE(pago, 0) + COALESCE(pago_anos_anteriores, 0) AS _pt,
      -- Grupo simplificado
      CASE
        WHEN LEFT(codigo_nome_grupo, 1) = '1' THEN 'Pessoal'
        WHEN LEFT(codigo_nome_grupo, 1) = '2' THEN 'Dívida'
        WHEN LEFT(codigo_nome_grupo, 1) = '3' THEN 'Custeio'
        WHEN LEFT(codigo_nome_grupo, 1) = '4' THEN 'Investimento'
        ELSE 'Outros'
      END AS _gs,
      -- Fonte simplificada
      CASE
        WHEN codigo_nome_fonte_recurso ILIKE '%tesouro%' THEN 'Tesouro'
        WHEN codigo_nome_fonte_recurso ILIKE '%fed%'
          OR codigo_nome_fonte_recurso ILIKE '%união%'
          OR codigo_nome_fonte_recurso ILIKE '%uniao%'
          OR codigo_nome_fonte_recurso ILIKE '%fundo nacional%'
          OR codigo_nome_fonte_recurso ILIKE '%transferência%'
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
      AND (p_tipo_despesa  IS NULL OR tipo_despesa              = ANY(string_to_array(p_tipo_despesa, '|')))
      AND (p_rotulo        IS NULL OR rotulo                    = ANY(string_to_array(p_rotulo, '|')))
      AND (p_fonte_recurso IS NULL OR (
            CASE
              WHEN codigo_nome_fonte_recurso ILIKE '%tesouro%' THEN 'Tesouro'
              WHEN codigo_nome_fonte_recurso ILIKE '%fed%'
                OR codigo_nome_fonte_recurso ILIKE '%união%'
                OR codigo_nome_fonte_recurso ILIKE '%uniao%'
                OR codigo_nome_fonte_recurso ILIKE '%fundo nacional%'
                OR codigo_nome_fonte_recurso ILIKE '%transferência%'
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
        SELECT tipo_despesa,
          SUM(empenhado) AS empenhado, SUM(liquidado) AS liquidado, SUM(_pt) AS pago_total
        FROM base WHERE tipo_despesa IS NOT NULL AND tipo_despesa<>''
        GROUP BY tipo_despesa ORDER BY 2 DESC LIMIT 12
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


-- ───────────────────────────────────────────────────────────────
-- 2. lc131_distincts
-- ───────────────────────────────────────────────────────────────
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
           codigo_nome_grupo, tipo_despesa, rotulo,
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
      AND (p_tipo_despesa  IS NULL OR tipo_despesa              = ANY(string_to_array(p_tipo_despesa, '|')))
      AND (p_rotulo        IS NULL OR rotulo                    = ANY(string_to_array(p_rotulo, '|')))
      AND (p_fonte_recurso IS NULL OR (
            CASE
              WHEN codigo_nome_fonte_recurso ILIKE '%tesouro%' THEN 'Tesouro'
              WHEN codigo_nome_fonte_recurso ILIKE '%fed%'
                OR codigo_nome_fonte_recurso ILIKE '%união%'
                OR codigo_nome_fonte_recurso ILIKE '%uniao%'
                OR codigo_nome_fonte_recurso ILIKE '%fundo nacional%'
                OR codigo_nome_fonte_recurso ILIKE '%transferência%'
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
    'distinct_tipo',       (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT tipo_despesa              AS d FROM filtered WHERE tipo_despesa IS NOT NULL AND tipo_despesa<>'') x),
    'distinct_rotulo',     (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT rotulo                    AS d FROM filtered WHERE rotulo IS NOT NULL AND rotulo<>'') x),
    'distinct_fonte',      (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT
                              CASE
                                WHEN codigo_nome_fonte_recurso ILIKE '%tesouro%' THEN 'Tesouro'
                                WHEN codigo_nome_fonte_recurso ILIKE '%fed%'
                                  OR codigo_nome_fonte_recurso ILIKE '%união%'
                                  OR codigo_nome_fonte_recurso ILIKE '%uniao%'
                                  OR codigo_nome_fonte_recurso ILIKE '%fundo nacional%'
                                  OR codigo_nome_fonte_recurso ILIKE '%transferência%'
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


-- ───────────────────────────────────────────────────────────────
-- 3. lc131_detail
-- ───────────────────────────────────────────────────────────────
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
           -- Fonte simplificada
           CASE
             WHEN codigo_nome_fonte_recurso ILIKE '%tesouro%' THEN 'Tesouro'
             WHEN codigo_nome_fonte_recurso ILIKE '%fed%'
               OR codigo_nome_fonte_recurso ILIKE '%união%'
               OR codigo_nome_fonte_recurso ILIKE '%uniao%'
               OR codigo_nome_fonte_recurso ILIKE '%fundo nacional%'
               OR codigo_nome_fonte_recurso ILIKE '%transferência%'
               OR codigo_nome_fonte_recurso ILIKE '%transferencia%'
               OR codigo_nome_fonte_recurso ILIKE '%SUS%' THEN 'Federal'
             ELSE 'Demais Fontes'
           END AS fonte_simpl,
           -- Grupo simplificado
           CASE
             WHEN LEFT(codigo_nome_grupo, 1) = '1' THEN 'Pessoal'
             WHEN LEFT(codigo_nome_grupo, 1) = '2' THEN 'Dívida'
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
      AND (p_tipo_despesa  IS NULL OR tipo_despesa              = ANY(string_to_array(p_tipo_despesa, '|')))
      AND (p_rotulo        IS NULL OR rotulo                    = ANY(string_to_array(p_rotulo, '|')))
      AND (p_fonte_recurso IS NULL OR (
            CASE
              WHEN codigo_nome_fonte_recurso ILIKE '%tesouro%' THEN 'Tesouro'
              WHEN codigo_nome_fonte_recurso ILIKE '%fed%'
                OR codigo_nome_fonte_recurso ILIKE '%união%'
                OR codigo_nome_fonte_recurso ILIKE '%uniao%'
                OR codigo_nome_fonte_recurso ILIKE '%fundo nacional%'
                OR codigo_nome_fonte_recurso ILIKE '%transferência%'
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
          tipo_despesa, rotulo,
          nome_municipio AS unidade,
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


-- ───────────────────────────────────────────────────────────────
-- 4. refresh_dashboard (re-enriquece após importações)
--    Otimizado: só atualiza linhas sem enriquecimento (drs IS NULL)
--    ou com pago_total desatualizado, em batches de 10000
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.refresh_dashboard()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET statement_timeout = 0
AS $$
DECLARE
  batch_size int := 10000;
  total_updated bigint := 0;
  rows_affected bigint;
BEGIN
  -- Loop em batches: só pega registros que ainda não foram enriquecidos
  LOOP
    WITH candidates AS (
      SELECT id FROM lc131_despesas
      WHERE drs IS NULL OR rotulo IS NULL
      LIMIT batch_size
    ),
    enriched AS (
      SELECT
        lc.id,
        NULLIF(TRIM(COALESCE(td.drs,  rb1.drs,  rb2.drs,  rb3.drs)),  '') AS e_drs,
        NULLIF(TRIM(COALESCE(tr.rras, rb1.rras, rb2.rras, rb3.rras)), '') AS e_rras,
        COALESCE(rb1.regiao_ad,     rb2.regiao_ad,     rb3.regiao_ad)     AS e_regiao_ad,
        COALESCE(rb1.regiao_sa,     rb2.regiao_sa,     rb3.regiao_sa)     AS e_regiao_sa,
        COALESCE(rb1.cod_ibge,      rb2.cod_ibge,      rb3.cod_ibge)      AS e_cod_ibge,
        COALESCE(lc.nome_municipio, rb1.municipio, rb2.municipio, rb3.municipio) AS e_municipio,
        COALESCE(rb1.fonte_recurso, rb2.fonte_recurso, rb3.fonte_recurso) AS e_fonte_recurso,
        COALESCE(rb1.grupo_despesa, rb2.grupo_despesa, rb3.grupo_despesa) AS e_grupo_despesa,
        COALESCE(rb1.tipo_despesa,  rb2.tipo_despesa,  rb3.tipo_despesa)  AS e_tipo_despesa,
        COALESCE(rb1.rotulo, rb2.rotulo, rb3.rotulo,
          CASE
            WHEN lc.codigo_nome_projeto_atividade ILIKE '%ambulat%'
              OR lc.codigo_nome_projeto_atividade ILIKE '%hospitalar%'
              OR lc.codigo_nome_projeto_atividade ILIKE '%rede%propria%'
              OR lc.codigo_nome_projeto_atividade ILIKE '%bata cinza%'
              OR lc.codigo_nome_projeto_atividade ILIKE '%UNICAMP%' THEN 'Assistência Hospitalar'
            WHEN lc.codigo_nome_projeto_atividade ILIKE '%farmac%'
              OR lc.codigo_nome_projeto_atividade ILIKE '%medicamento%' THEN 'Assistência Farmacêutica'
            WHEN lc.codigo_nome_projeto_atividade ILIKE '%vigil%' THEN 'Vigilância em Saúde'
            WHEN lc.codigo_nome_projeto_atividade ILIKE '%aparelh%'
              OR lc.codigo_nome_projeto_atividade ILIKE '%equip%'
              OR lc.codigo_nome_projeto_atividade ILIKE '%reform%'
              OR lc.codigo_nome_projeto_atividade ILIKE '%construc%' THEN 'Infraestrutura'
            WHEN lc.codigo_nome_projeto_atividade ILIKE '%admin%'
              OR lc.codigo_nome_projeto_atividade ILIKE '%conselho%' THEN 'Gestão e Administração'
            WHEN lc.codigo_nome_projeto_atividade ILIKE '%emenda%' THEN 'Emendas Parlamentares'
            WHEN lc.codigo_nome_projeto_atividade ILIKE '%judicial%'
              OR lc.codigo_nome_projeto_atividade ILIKE '%demanda%jud%' THEN 'Demandas Judiciais'
            WHEN lc.codigo_nome_projeto_atividade ILIKE '%subvenc%'
              OR lc.codigo_nome_projeto_atividade ILIKE '%filantrop%' THEN 'Entidades Filantrópicas'
            WHEN lc.codigo_nome_projeto_atividade ILIKE '%resid%med%'
              OR lc.codigo_nome_projeto_atividade ILIKE '%capacit%' THEN 'Formação e Capacitação'
            WHEN lc.codigo_nome_projeto_atividade ILIKE '%descentraliz%'
              OR lc.codigo_nome_projeto_atividade ILIKE '%prisional%' THEN 'Atenção Descentralizada'
            WHEN lc.codigo_nome_projeto_atividade ILIKE '%publicidade%' THEN 'Comunicação'
            ELSE 'Outros'
          END
        ) AS e_rotulo
      FROM lc131_despesas lc
      INNER JOIN candidates c ON c.id = lc.id
      LEFT JOIN tab_drs  td  ON td.municipio = lc.nome_municipio
      LEFT JOIN tab_rras tr  ON tr.municipio = lc.nome_municipio
      LEFT JOIN bd_ref   rb1 ON rb1.codigo = lc.codigo_projeto_atividade::text
      LEFT JOIN bd_ref   rb2 ON rb2.codigo = lc.codigo_ug::text
      LEFT JOIN bd_ref   rb3 ON rb3.codigo = NULLIF(regexp_replace(
          split_part(lc.codigo_nome_ug::text, ' ', 1), '[^0-9]', '', 'g'), '')
    )
    UPDATE lc131_despesas tgt
    SET
      drs           = enriched.e_drs,
      rras          = enriched.e_rras,
      regiao_ad     = enriched.e_regiao_ad,
      regiao_sa     = enriched.e_regiao_sa,
      cod_ibge      = enriched.e_cod_ibge,
      municipio     = enriched.e_municipio,
      fonte_recurso = enriched.e_fonte_recurso,
      grupo_despesa = enriched.e_grupo_despesa,
      tipo_despesa  = enriched.e_tipo_despesa,
      rotulo        = enriched.e_rotulo,
      pago_total    = COALESCE(tgt.pago, 0) + COALESCE(tgt.pago_anos_anteriores, 0)
    FROM enriched
    WHERE tgt.id = enriched.id;

    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    total_updated := total_updated + rows_affected;

    EXIT WHEN rows_affected = 0;
  END LOOP;

  RAISE NOTICE 'refresh_dashboard: % registros atualizados', total_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_dashboard() TO anon, authenticated;


-- ───────────────────────────────────────────────────────────────
-- 5. lc131_map_data — dados agregados para o mapa interativo
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lc131_map_data(
  p_ano integer DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public SET statement_timeout = 0
AS $$
DECLARE result json;
BEGIN
  WITH base AS (
    SELECT municipio, drs, rras,
      COALESCE(empenhado, 0) AS empenhado,
      COALESCE(liquidado, 0) AS liquidado,
      COALESCE(pago, 0) + COALESCE(pago_anos_anteriores, 0) AS pago_total
    FROM lc131_despesas
    WHERE (p_ano IS NULL OR ano_referencia = p_ano)
  )
  SELECT json_build_object(
    'kpis', (
      SELECT json_build_object(
        'empenhado',  SUM(empenhado),
        'liquidado',  SUM(liquidado),
        'pago_total', SUM(pago_total),
        'registros',  COUNT(*),
        'municipios', COUNT(DISTINCT NULLIF(municipio, '')),
        'drs_count',  COUNT(DISTINCT NULLIF(drs, ''))
      ) FROM base
    ),
    'por_drs', (
      SELECT json_agg(r ORDER BY r.empenhado DESC) FROM (
        SELECT drs,
          SUM(empenhado) AS empenhado,
          SUM(liquidado) AS liquidado,
          SUM(pago_total) AS pago_total,
          COUNT(DISTINCT NULLIF(municipio, '')) AS municipios,
          COUNT(*) AS registros
        FROM base WHERE drs IS NOT NULL AND drs <> ''
        GROUP BY drs
      ) r
    ),
    'por_rras', (
      SELECT json_agg(r ORDER BY r.empenhado DESC) FROM (
        SELECT rras,
          SUM(empenhado) AS empenhado,
          SUM(liquidado) AS liquidado,
          SUM(pago_total) AS pago_total,
          COUNT(DISTINCT NULLIF(municipio, '')) AS municipios,
          COUNT(*) AS registros
        FROM base WHERE rras IS NOT NULL AND rras <> ''
        GROUP BY rras
      ) r
    ),
    'municipios', (
      SELECT json_agg(r ORDER BY r.empenhado DESC) FROM (
        SELECT municipio,
          MAX(NULLIF(drs, ''))  AS drs,
          MAX(NULLIF(rras, '')) AS rras,
          SUM(empenhado)  AS empenhado,
          SUM(liquidado)  AS liquidado,
          SUM(pago_total) AS pago_total,
          COUNT(*)        AS registros
        FROM base
        WHERE municipio IS NOT NULL AND municipio <> ''
        GROUP BY municipio
      ) r
    )
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lc131_map_data(integer) TO anon, authenticated;


-- ───────────────────────────────────────────────────────────────
-- 6. lc131_delete_year — deleta registros por ano (bypass RLS)
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lc131_delete_year(p_ano integer)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET statement_timeout = 0
AS $$
DECLARE deleted bigint;
BEGIN
  DELETE FROM lc131_despesas WHERE ano_referencia = p_ano;
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lc131_delete_year(integer) TO anon, authenticated;


-- ───────────────────────────────────────────────────────────────
-- 7. refresh_dashboard_batch — processa UM batch e retorna qtd atualizada
--    Chamar repetidamente até retornar 0
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.refresh_dashboard_batch(p_batch_size integer DEFAULT 5000)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET statement_timeout = 120000
AS $$
DECLARE rows_affected bigint;
BEGIN
  WITH candidates AS (
    SELECT id FROM lc131_despesas
    WHERE drs IS NULL OR rotulo IS NULL
    LIMIT p_batch_size
  ),
  enriched AS (
    SELECT
      lc.id,
      NULLIF(TRIM(COALESCE(td.drs,  rb1.drs,  rb2.drs,  rb3.drs)),  '') AS e_drs,
      NULLIF(TRIM(COALESCE(tr.rras, rb1.rras, rb2.rras, rb3.rras)), '') AS e_rras,
      COALESCE(rb1.regiao_ad,     rb2.regiao_ad,     rb3.regiao_ad)     AS e_regiao_ad,
      COALESCE(rb1.regiao_sa,     rb2.regiao_sa,     rb3.regiao_sa)     AS e_regiao_sa,
      COALESCE(rb1.cod_ibge,      rb2.cod_ibge,      rb3.cod_ibge)      AS e_cod_ibge,
      COALESCE(lc.nome_municipio, rb1.municipio, rb2.municipio, rb3.municipio) AS e_municipio,
      COALESCE(rb1.fonte_recurso, rb2.fonte_recurso, rb3.fonte_recurso) AS e_fonte_recurso,
      COALESCE(rb1.grupo_despesa, rb2.grupo_despesa, rb3.grupo_despesa) AS e_grupo_despesa,
      COALESCE(rb1.tipo_despesa,  rb2.tipo_despesa,  rb3.tipo_despesa)  AS e_tipo_despesa,
      COALESCE(rb1.rotulo, rb2.rotulo, rb3.rotulo,
        CASE
          WHEN lc.codigo_nome_projeto_atividade ILIKE '%ambulat%'
            OR lc.codigo_nome_projeto_atividade ILIKE '%hospitalar%'
            OR lc.codigo_nome_projeto_atividade ILIKE '%rede%propria%'
            OR lc.codigo_nome_projeto_atividade ILIKE '%bata cinza%'
            OR lc.codigo_nome_projeto_atividade ILIKE '%UNICAMP%' THEN 'Assistência Hospitalar'
          WHEN lc.codigo_nome_projeto_atividade ILIKE '%farmac%'
            OR lc.codigo_nome_projeto_atividade ILIKE '%medicamento%' THEN 'Assistência Farmacêutica'
          WHEN lc.codigo_nome_projeto_atividade ILIKE '%vigil%' THEN 'Vigilância em Saúde'
          WHEN lc.codigo_nome_projeto_atividade ILIKE '%aparelh%'
            OR lc.codigo_nome_projeto_atividade ILIKE '%equip%'
            OR lc.codigo_nome_projeto_atividade ILIKE '%reform%'
            OR lc.codigo_nome_projeto_atividade ILIKE '%construc%' THEN 'Infraestrutura'
          WHEN lc.codigo_nome_projeto_atividade ILIKE '%admin%'
            OR lc.codigo_nome_projeto_atividade ILIKE '%conselho%' THEN 'Gestão e Administração'
          WHEN lc.codigo_nome_projeto_atividade ILIKE '%emenda%' THEN 'Emendas Parlamentares'
          WHEN lc.codigo_nome_projeto_atividade ILIKE '%judicial%'
            OR lc.codigo_nome_projeto_atividade ILIKE '%demanda%jud%' THEN 'Demandas Judiciais'
          WHEN lc.codigo_nome_projeto_atividade ILIKE '%subvenc%'
            OR lc.codigo_nome_projeto_atividade ILIKE '%filantrop%' THEN 'Entidades Filantrópicas'
          WHEN lc.codigo_nome_projeto_atividade ILIKE '%resid%med%'
            OR lc.codigo_nome_projeto_atividade ILIKE '%capacit%' THEN 'Formação e Capacitação'
          WHEN lc.codigo_nome_projeto_atividade ILIKE '%descentraliz%'
            OR lc.codigo_nome_projeto_atividade ILIKE '%prisional%' THEN 'Atenção Descentralizada'
          WHEN lc.codigo_nome_projeto_atividade ILIKE '%publicidade%' THEN 'Comunicação'
          ELSE 'Outros'
        END
      ) AS e_rotulo
    FROM lc131_despesas lc
    INNER JOIN candidates c ON c.id = lc.id
    LEFT JOIN tab_drs  td  ON td.municipio = lc.nome_municipio
    LEFT JOIN tab_rras tr  ON tr.municipio = lc.nome_municipio
    LEFT JOIN bd_ref   rb1 ON rb1.codigo = lc.codigo_projeto_atividade::text
    LEFT JOIN bd_ref   rb2 ON rb2.codigo = lc.codigo_ug::text
    LEFT JOIN bd_ref   rb3 ON rb3.codigo = NULLIF(regexp_replace(
        split_part(lc.codigo_nome_ug::text, ' ', 1), '[^0-9]', '', 'g'), '')
  )
  UPDATE lc131_despesas tgt
  SET
    drs           = enriched.e_drs,
    rras          = enriched.e_rras,
    regiao_ad     = enriched.e_regiao_ad,
    regiao_sa     = enriched.e_regiao_sa,
    cod_ibge      = enriched.e_cod_ibge,
    municipio     = enriched.e_municipio,
    fonte_recurso = enriched.e_fonte_recurso,
    grupo_despesa = enriched.e_grupo_despesa,
    tipo_despesa  = enriched.e_tipo_despesa,
    rotulo        = enriched.e_rotulo,
    pago_total    = COALESCE(tgt.pago, 0) + COALESCE(tgt.pago_anos_anteriores, 0)
  FROM enriched
  WHERE tgt.id = enriched.id;

  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_dashboard_batch(integer) TO anon, authenticated;


-- Recarregar schema do PostgREST (necessário para novas funções)
NOTIFY pgrst, 'reload schema';


-- ═══════════════════════════════════════════════════════════════
-- PASSO 2: EXECUTAR REFRESH (após rodar tudo acima)
-- Rodar esta linha SEPARADAMENTE, repetir até retornar 0:
-- ═══════════════════════════════════════════════════════════════
-- SELECT refresh_dashboard_batch(5000);


-- Teste final (rodar após refresh completo)
-- SELECT pg_size_pretty(pg_database_size(current_database())) AS tamanho;
-- SELECT lc131_dashboard(2026) IS NOT NULL AS ok;
