-- ================================================================
-- UPGRADE v3 — MATERIALIZED VIEW + Performance + Encoding Fix
-- Execute no Supabase Dashboard → SQL Editor
-- Pré-requisito: supabase_setup.sql já executado (tabelas existem)
-- ================================================================
-- MELHORIAS:
--   • MATERIALIZED VIEW lc131_mv pré-computa todos os JOINs
--   • Índices B-tree em cada coluna de filtro do MV
--   • = ANY(string_to_array()) no lugar de regexp_split_to_table+ILIKE
--   • Correção de encoding mojibake (Ã§→ç, Ã£→ã, etc.)
--   • Função refresh_dashboard() para atualizar o MV após importações
-- ================================================================


-- ================================================================
-- PASSO 1: CORRIGIR ENCODING MOJIBAKE
-- UTF-8 duplo-codificado (bytes UTF-8 interpretados como Latin-1)
-- Padrões comuns em português: Ã§→ç, Ã£→ã, Ã©→é, etc.
-- ================================================================

-- Helper: função reutilizável para desfazer mojibake
CREATE OR REPLACE FUNCTION public._fix_mojibake(t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
         REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
         REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
         REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(t,
    'Ã§', 'ç'), 'Ã£', 'ã'), 'Ã©', 'é'), 'Ãª', 'ê'),
    'Ã³', 'ó'), 'Ã¡', 'á'), 'Ã­', 'í'), 'Ãº', 'ú'),
    'Ã¢', 'â'), 'Ã´', 'ô'), 'Ã', 'À'), 'Ã‡', 'Ç'),
    'Ã‰', 'É'), 'Ã"', 'Ó'), 'Ãš', 'Ú'), 'Ã', 'Í'),
    'Ã¼', 'ü'), 'Ã±', 'ñ'), 'Ãµ', 'õ'), 'Ã¶', 'ö')
$$;

-- tab_drs: corrige DRS e chave município
UPDATE public.tab_drs
SET drs = _fix_mojibake(drs)
WHERE drs ~ 'Ã';

UPDATE public.tab_drs
SET municipio = _fix_mojibake(municipio)
WHERE municipio ~ 'Ã';

-- tab_rras: corrige RRAS e chave município
UPDATE public.tab_rras
SET rras = _fix_mojibake(rras)
WHERE rras ~ 'Ã';

UPDATE public.tab_rras
SET municipio = _fix_mojibake(municipio)
WHERE municipio ~ 'Ã';

-- bd_ref: corrige DRS, região, município
UPDATE public.bd_ref
SET drs       = _fix_mojibake(drs),
    regiao_ad = _fix_mojibake(regiao_ad),
    regiao_sa = _fix_mojibake(regiao_sa),
    municipio = _fix_mojibake(municipio)
WHERE drs ~ 'Ã' OR regiao_ad ~ 'Ã' OR regiao_sa ~ 'Ã' OR municipio ~ 'Ã';

-- Limpa espaços extras
UPDATE public.tab_drs  SET drs       = TRIM(REGEXP_REPLACE(drs,  '\s+', ' ', 'g')) WHERE drs  <> TRIM(REGEXP_REPLACE(drs,  '\s+', ' ', 'g'));
UPDATE public.tab_drs  SET municipio = TRIM(municipio) WHERE municipio <> TRIM(municipio);
UPDATE public.tab_rras SET rras      = TRIM(REGEXP_REPLACE(rras, '\s+', ' ', 'g')) WHERE rras <> TRIM(REGEXP_REPLACE(rras, '\s+', ' ', 'g'));
UPDATE public.tab_rras SET municipio = TRIM(municipio) WHERE municipio <> TRIM(municipio);


-- ================================================================
-- PASSO 2: DROP OBJETOS ANTIGOS
-- ================================================================
DROP FUNCTION IF EXISTS public.lc131_dashboard(integer);
DROP FUNCTION IF EXISTS public.lc131_dashboard(integer,text,text,text,text,text,text,text,text,text,text,text,text,text);
DROP FUNCTION IF EXISTS public.lc131_distincts(integer,text,text,text,text,text,text,text,text,text,text);
DROP FUNCTION IF EXISTS public.lc131_distincts(integer,text,text,text,text,text,text,text,text,text,text,text,text,text);
DROP FUNCTION IF EXISTS public.lc131_detail(integer,text,text,text,text,text,text,text,text,text,text,integer,integer);
DROP FUNCTION IF EXISTS public.lc131_detail(integer,text,text,text,text,text,text,text,text,text,text,text,text,text,integer,integer);
DROP FUNCTION IF EXISTS public.refresh_dashboard();
DROP VIEW IF EXISTS public.lc131_enriquecida CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.lc131_mv CASCADE;


-- ================================================================
-- PASSO 3: ÍNDICES NA TABELA BASE (acelera criação do MV)
-- ================================================================
CREATE INDEX IF NOT EXISTS idx_lc131_cod_projeto       ON public.lc131_despesas (codigo_projeto_atividade);
CREATE INDEX IF NOT EXISTS idx_lc131_cod_ug            ON public.lc131_despesas (codigo_ug);
CREATE INDEX IF NOT EXISTS idx_lc131_nome_municipio    ON public.lc131_despesas (nome_municipio);
CREATE INDEX IF NOT EXISTS idx_lc131_ano               ON public.lc131_despesas (ano_referencia);


-- ================================================================
-- PASSO 4: MATERIALIZED VIEW — pré-computa todos os JOINs
-- Dados ficam em tabela física com índices, sem JOINs em runtime.
-- ================================================================
CREATE MATERIALIZED VIEW public.lc131_mv AS
SELECT
  lc.id,
  lc.ano_referencia,

  -- DRS: tab_drs prioritário, bd_ref fallback
  NULLIF(TRIM(COALESCE(td.drs, rb1.drs, rb2.drs, rb3.drs)), '') AS drs,

  -- RRAS: tab_rras prioritário, bd_ref fallback
  NULLIF(TRIM(COALESCE(tr.rras, rb1.rras, rb2.rras, rb3.rras)), '') AS rras,

  -- Enriquecimento geográfico via bd_ref
  COALESCE(rb1.regiao_ad,      rb2.regiao_ad,      rb3.regiao_ad)      AS regiao_ad,
  COALESCE(rb1.regiao_sa,      rb2.regiao_sa,      rb3.regiao_sa)      AS regiao_sa,
  COALESCE(rb1.cod_ibge,       rb2.cod_ibge,       rb3.cod_ibge)       AS cod_ibge,
  COALESCE(lc.nome_municipio,  rb1.municipio,      rb2.municipio,      rb3.municipio) AS municipio,

  -- Classificação financeira via bd_ref
  COALESCE(rb1.fonte_recurso,  rb2.fonte_recurso,  rb3.fonte_recurso)  AS fonte_recurso,
  COALESCE(rb1.grupo_despesa,  rb2.grupo_despesa,  rb3.grupo_despesa)  AS grupo_despesa,
  COALESCE(rb1.tipo_despesa,   rb2.tipo_despesa,   rb3.tipo_despesa)   AS tipo_despesa,
  COALESCE(rb1.rotulo,         rb2.rotulo,         rb3.rotulo)         AS rotulo,

  -- Colunas originais LC131
  lc.codigo_nome_uo,
  lc.codigo_nome_ug,
  lc.codigo_ug,
  lc.codigo_nome_projeto_atividade,
  lc.codigo_projeto_atividade,
  lc.codigo_nome_fonte_recurso,
  lc.codigo_fonte_recursos,
  lc.codigo_nome_grupo,
  lc.codigo_nome_elemento,
  lc.codigo_elemento,
  lc.codigo_nome_favorecido,
  lc.codigo_favorecido,
  lc.descricao_processo,
  lc.numero_processo,
  lc.nome_municipio,

  -- Valores financeiros
  lc.empenhado,
  lc.liquidado,
  lc.pago,
  lc.pago_anos_anteriores,
  COALESCE(lc.pago, 0) + COALESCE(lc.pago_anos_anteriores, 0) AS pago_total

FROM public.lc131_despesas lc
LEFT JOIN public.tab_drs td   ON td.municipio = lc.nome_municipio
LEFT JOIN public.tab_rras tr  ON tr.municipio = lc.nome_municipio
LEFT JOIN public.bd_ref rb1   ON rb1.codigo = lc.codigo_projeto_atividade::text
LEFT JOIN public.bd_ref rb2   ON rb2.codigo = lc.codigo_ug::text
LEFT JOIN public.bd_ref rb3   ON rb3.codigo = NULLIF(regexp_replace(
    split_part(lc.codigo_nome_ug::text, ' ', 1), '[^0-9]', '', 'g'), '');

-- Backward-compat view (permite queries legadas)
CREATE OR REPLACE VIEW public.lc131_enriquecida AS SELECT * FROM public.lc131_mv;

-- Permissões
GRANT SELECT ON public.lc131_mv            TO anon, authenticated;
GRANT SELECT ON public.lc131_enriquecida   TO anon, authenticated;
GRANT SELECT ON public.lc131_despesas      TO anon, authenticated;
GRANT SELECT ON public.bd_ref              TO anon, authenticated;

-- RLS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lc131_despesas' AND policyname = 'anon_read_lc131') THEN
    ALTER TABLE public.lc131_despesas ENABLE ROW LEVEL SECURITY;
    CREATE POLICY anon_read_lc131 ON public.lc131_despesas FOR SELECT TO anon USING (true);
  END IF;
END $$;


-- ================================================================
-- PASSO 5: ÍNDICES NO MATERIALIZED VIEW
-- B-tree em cada coluna de filtro → = ANY() usa index scan
-- ================================================================
CREATE UNIQUE INDEX idx_mv_id          ON public.lc131_mv (id);
CREATE INDEX idx_mv_ano                ON public.lc131_mv (ano_referencia);
CREATE INDEX idx_mv_drs                ON public.lc131_mv (drs)                       WHERE drs IS NOT NULL AND drs <> '';
CREATE INDEX idx_mv_regiao_ad          ON public.lc131_mv (regiao_ad)                 WHERE regiao_ad IS NOT NULL AND regiao_ad <> '';
CREATE INDEX idx_mv_municipio          ON public.lc131_mv (municipio)                 WHERE municipio IS NOT NULL AND municipio <> '';
CREATE INDEX idx_mv_rras               ON public.lc131_mv (rras)                      WHERE rras IS NOT NULL AND rras <> '';
CREATE INDEX idx_mv_regiao_sa          ON public.lc131_mv (regiao_sa)                 WHERE regiao_sa IS NOT NULL AND regiao_sa <> '';
CREATE INDEX idx_mv_grupo              ON public.lc131_mv (codigo_nome_grupo)         WHERE codigo_nome_grupo IS NOT NULL AND codigo_nome_grupo <> '';
CREATE INDEX idx_mv_tipo_despesa       ON public.lc131_mv (tipo_despesa)              WHERE tipo_despesa IS NOT NULL AND tipo_despesa <> '';
CREATE INDEX idx_mv_rotulo             ON public.lc131_mv (rotulo)                    WHERE rotulo IS NOT NULL AND rotulo <> '';
CREATE INDEX idx_mv_fonte              ON public.lc131_mv (codigo_nome_fonte_recurso) WHERE codigo_nome_fonte_recurso IS NOT NULL AND codigo_nome_fonte_recurso <> '';
CREATE INDEX idx_mv_codigo_ug          ON public.lc131_mv (codigo_ug);
CREATE INDEX idx_mv_uo                 ON public.lc131_mv (codigo_nome_uo)            WHERE codigo_nome_uo IS NOT NULL AND codigo_nome_uo <> '';
CREATE INDEX idx_mv_elemento           ON public.lc131_mv (codigo_nome_elemento)      WHERE codigo_nome_elemento IS NOT NULL AND codigo_nome_elemento <> '';
CREATE INDEX idx_mv_favorecido         ON public.lc131_mv (codigo_nome_favorecido)    WHERE codigo_nome_favorecido IS NOT NULL AND codigo_nome_favorecido <> '';
CREATE INDEX idx_mv_empenhado          ON public.lc131_mv (empenhado DESC NULLS LAST);
-- Compostos para consultas filtradas por ano
CREATE INDEX idx_mv_ano_drs            ON public.lc131_mv (ano_referencia, drs);
CREATE INDEX idx_mv_ano_municipio      ON public.lc131_mv (ano_referencia, municipio);


-- ================================================================
-- PASSO 6: FUNÇÃO refresh_dashboard()
-- Chame após importar dados ou quando DRS/RRAS forem atualizados.
-- Usa CONCURRENTLY para não bloquear leituras.
-- ================================================================
CREATE OR REPLACE FUNCTION public.refresh_dashboard()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = 0
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY lc131_mv;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_dashboard() TO anon, authenticated;


-- ================================================================
-- PASSO 7: lc131_dashboard — v3 com MV + ANY
-- Todas as agregações para gráficos em uma única chamada.
-- usa = ANY(string_to_array()) em vez de regexp_split_to_table+ILIKE
-- ================================================================
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
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = 0
AS $$
DECLARE result json;
BEGIN
  WITH base AS (
    SELECT *
    FROM lc131_mv
    WHERE
      (p_ano           IS NULL OR ano_referencia = p_ano)
      AND (p_drs           IS NULL OR drs                       = ANY(string_to_array(p_drs, '|')))
      AND (p_regiao_ad     IS NULL OR regiao_ad                 = ANY(string_to_array(p_regiao_ad, '|')))
      AND (p_rras          IS NULL OR rras                      = ANY(string_to_array(p_rras, '|')))
      AND (p_regiao_sa     IS NULL OR regiao_sa                 = ANY(string_to_array(p_regiao_sa, '|')))
      AND (p_municipio     IS NULL OR municipio                 = ANY(string_to_array(p_municipio, '|')))
      AND (p_grupo_despesa IS NULL OR codigo_nome_grupo         = ANY(string_to_array(p_grupo_despesa, '|')))
      AND (p_tipo_despesa  IS NULL OR tipo_despesa              = ANY(string_to_array(p_tipo_despesa, '|')))
      AND (p_rotulo        IS NULL OR rotulo                    = ANY(string_to_array(p_rotulo, '|')))
      AND (p_fonte_recurso IS NULL OR codigo_nome_fonte_recurso = ANY(string_to_array(p_fonte_recurso, '|')))
      AND (p_codigo_ug     IS NULL OR codigo_ug::text           = ANY(string_to_array(p_codigo_ug, '|')))
      AND (p_uo            IS NULL OR codigo_nome_uo            = ANY(string_to_array(p_uo, '|')))
      AND (p_elemento      IS NULL OR codigo_nome_elemento      = ANY(string_to_array(p_elemento, '|')))
      AND (p_favorecido    IS NULL OR codigo_nome_favorecido    = ANY(string_to_array(p_favorecido, '|')))
  )
  SELECT json_build_object(

    -- KPIs
    'kpis', (
      SELECT json_build_object(
        'empenhado',  SUM(COALESCE(empenhado, 0)),
        'liquidado',  SUM(COALESCE(liquidado, 0)),
        'pago',       SUM(COALESCE(pago, 0)),
        'pago_total', SUM(pago_total),
        'total',      COUNT(*),
        'municipios', COUNT(DISTINCT COALESCE(municipio, codigo_ug::text))
      ) FROM base
    ),

    -- Evolução anual
    'por_ano', (
      SELECT json_agg(r ORDER BY r.ano) FROM (
        SELECT ano_referencia::int AS ano,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(COALESCE(liquidado, 0)) AS liquidado,
          SUM(COALESCE(pago, 0))      AS pago,
          SUM(pago_total)             AS pago_total,
          COUNT(*)                    AS registros
        FROM base WHERE ano_referencia IS NOT NULL
        GROUP BY ano_referencia
      ) r
    ),

    -- Grupo de despesa
    'por_grupo', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_grupo AS grupo_despesa,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(COALESCE(liquidado, 0)) AS liquidado,
          SUM(pago_total)             AS pago_total
        FROM base WHERE codigo_nome_grupo IS NOT NULL AND codigo_nome_grupo <> ''
        GROUP BY codigo_nome_grupo ORDER BY 2 DESC LIMIT 12
      ) r
    ),

    -- DRS
    'por_drs', (
      SELECT json_agg(r) FROM (
        SELECT drs,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(COALESCE(liquidado, 0)) AS liquidado,
          SUM(pago_total)             AS pago_total
        FROM base WHERE drs IS NOT NULL AND drs <> ''
        GROUP BY drs ORDER BY 2 DESC LIMIT 20
      ) r
    ),

    -- Município
    'por_municipio', (
      SELECT json_agg(r) FROM (
        SELECT municipio,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(pago_total)             AS pago_total
        FROM base WHERE municipio IS NOT NULL AND municipio <> ''
        GROUP BY municipio ORDER BY 2 DESC LIMIT 15
      ) r
    ),

    -- Fonte de recurso
    'por_fonte', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_fonte_recurso AS fonte_recurso,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(pago_total)             AS pago_total
        FROM base WHERE codigo_nome_fonte_recurso IS NOT NULL AND codigo_nome_fonte_recurso <> ''
        GROUP BY codigo_nome_fonte_recurso ORDER BY 2 DESC LIMIT 12
      ) r
    ),

    -- Elemento de despesa
    'por_elemento', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_elemento AS elemento,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(pago_total)             AS pago_total
        FROM base WHERE codigo_nome_elemento IS NOT NULL AND codigo_nome_elemento <> ''
        GROUP BY codigo_nome_elemento ORDER BY 2 DESC LIMIT 12
      ) r
    ),

    -- Região administrativa
    'por_regiao_ad', (
      SELECT json_agg(r) FROM (
        SELECT regiao_ad,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(pago_total)             AS pago_total
        FROM base WHERE regiao_ad IS NOT NULL AND regiao_ad <> ''
        GROUP BY regiao_ad ORDER BY 2 DESC LIMIT 20
      ) r
    ),

    -- UO (unidade orçamentária)
    'por_uo', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_uo AS uo,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(COALESCE(liquidado, 0)) AS liquidado,
          SUM(pago_total)             AS pago_total
        FROM base WHERE codigo_nome_uo IS NOT NULL AND codigo_nome_uo <> ''
        GROUP BY codigo_nome_uo ORDER BY 2 DESC LIMIT 15
      ) r
    ),

    -- RRAS
    'por_rras', (
      SELECT json_agg(r) FROM (
        SELECT rras,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(COALESCE(liquidado, 0)) AS liquidado,
          SUM(pago_total)             AS pago_total
        FROM base WHERE rras IS NOT NULL AND rras <> ''
        GROUP BY rras ORDER BY 2 DESC LIMIT 20
      ) r
    ),

    -- Tipo de despesa
    'por_tipo_despesa', (
      SELECT json_agg(r) FROM (
        SELECT tipo_despesa,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(COALESCE(liquidado, 0)) AS liquidado,
          SUM(pago_total)             AS pago_total
        FROM base WHERE tipo_despesa IS NOT NULL AND tipo_despesa <> ''
        GROUP BY tipo_despesa ORDER BY 2 DESC LIMIT 12
      ) r
    ),

    -- Rótulo
    'por_rotulo', (
      SELECT json_agg(r) FROM (
        SELECT rotulo,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(pago_total)             AS pago_total
        FROM base WHERE rotulo IS NOT NULL AND rotulo <> ''
        GROUP BY rotulo ORDER BY 2 DESC LIMIT 12
      ) r
    ),

    -- Top favorecidos
    'por_favorecido', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_favorecido AS favorecido,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(pago_total)             AS pago_total,
          COUNT(*)                    AS contratos
        FROM base WHERE codigo_nome_favorecido IS NOT NULL AND codigo_nome_favorecido <> ''
        GROUP BY codigo_nome_favorecido ORDER BY 2 DESC LIMIT 20
      ) r
    ),

    -- Top projetos/atividades
    'por_projeto', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_projeto_atividade AS projeto,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(pago_total)             AS pago_total,
          COUNT(*)                    AS registros
        FROM base WHERE codigo_nome_projeto_atividade IS NOT NULL AND codigo_nome_projeto_atividade <> ''
        GROUP BY codigo_nome_projeto_atividade ORDER BY 2 DESC LIMIT 20
      ) r
    ),

    -- Top UGs
    'por_ug', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_ug AS ug,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(pago_total)             AS pago_total
        FROM base WHERE codigo_nome_ug IS NOT NULL AND codigo_nome_ug <> ''
        GROUP BY codigo_nome_ug ORDER BY 2 DESC LIMIT 15
      ) r
    ),

    -- Região de saúde
    'por_regiao_sa', (
      SELECT json_agg(r) FROM (
        SELECT regiao_sa,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(pago_total)             AS pago_total
        FROM base WHERE regiao_sa IS NOT NULL AND regiao_sa <> ''
        GROUP BY regiao_sa ORDER BY 2 DESC LIMIT 20
      ) r
    )

  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lc131_dashboard(integer,text,text,text,text,text,text,text,text,text,text,text,text,text) TO anon, authenticated;


-- ================================================================
-- PASSO 8: lc131_distincts — v3 com MV + ANY
-- Retorna valores distintos cascateados para popular dropdowns.
-- ================================================================
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
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = 0
AS $$
DECLARE result json;
BEGIN
  WITH filtered AS (
    SELECT
      drs,
      regiao_ad,
      rras,
      regiao_sa,
      municipio,
      codigo_nome_grupo,
      tipo_despesa,
      rotulo,
      codigo_nome_fonte_recurso,
      codigo_ug,
      codigo_nome_uo,
      codigo_nome_elemento,
      codigo_nome_favorecido
    FROM lc131_mv
    WHERE
      (p_ano           IS NULL OR ano_referencia = p_ano)
      AND (p_drs           IS NULL OR drs                       = ANY(string_to_array(p_drs, '|')))
      AND (p_regiao_ad     IS NULL OR regiao_ad                 = ANY(string_to_array(p_regiao_ad, '|')))
      AND (p_rras          IS NULL OR rras                      = ANY(string_to_array(p_rras, '|')))
      AND (p_regiao_sa     IS NULL OR regiao_sa                 = ANY(string_to_array(p_regiao_sa, '|')))
      AND (p_municipio     IS NULL OR municipio                 = ANY(string_to_array(p_municipio, '|')))
      AND (p_grupo_despesa IS NULL OR codigo_nome_grupo         = ANY(string_to_array(p_grupo_despesa, '|')))
      AND (p_tipo_despesa  IS NULL OR tipo_despesa              = ANY(string_to_array(p_tipo_despesa, '|')))
      AND (p_rotulo        IS NULL OR rotulo                    = ANY(string_to_array(p_rotulo, '|')))
      AND (p_fonte_recurso IS NULL OR codigo_nome_fonte_recurso = ANY(string_to_array(p_fonte_recurso, '|')))
      AND (p_codigo_ug     IS NULL OR codigo_ug::text           = ANY(string_to_array(p_codigo_ug, '|')))
      AND (p_uo            IS NULL OR codigo_nome_uo            = ANY(string_to_array(p_uo, '|')))
      AND (p_elemento      IS NULL OR codigo_nome_elemento      = ANY(string_to_array(p_elemento, '|')))
      AND (p_favorecido    IS NULL OR codigo_nome_favorecido    = ANY(string_to_array(p_favorecido, '|')))
  )
  SELECT json_build_object(
    'distinct_drs',        (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT drs                       AS d FROM filtered WHERE drs                       IS NOT NULL AND drs <> '') x),
    'distinct_regiao_ad',  (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT regiao_ad                 AS d FROM filtered WHERE regiao_ad                 IS NOT NULL AND regiao_ad <> '') x),
    'distinct_rras',       (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT rras                      AS d FROM filtered WHERE rras                      IS NOT NULL AND rras <> '') x),
    'distinct_regiao_sa',  (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT regiao_sa                 AS d FROM filtered WHERE regiao_sa                 IS NOT NULL AND regiao_sa <> '') x),
    'distinct_municipio',  (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT municipio                 AS d FROM filtered WHERE municipio                 IS NOT NULL AND municipio <> '') x),
    'distinct_grupo',      (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT codigo_nome_grupo         AS d FROM filtered WHERE codigo_nome_grupo         IS NOT NULL AND codigo_nome_grupo <> '') x),
    'distinct_tipo',       (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT tipo_despesa              AS d FROM filtered WHERE tipo_despesa              IS NOT NULL AND tipo_despesa <> '') x),
    'distinct_rotulo',     (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT rotulo                    AS d FROM filtered WHERE rotulo                    IS NOT NULL AND rotulo <> '') x),
    'distinct_fonte',      (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT codigo_nome_fonte_recurso AS d FROM filtered WHERE codigo_nome_fonte_recurso IS NOT NULL AND codigo_nome_fonte_recurso <> '') x),
    'distinct_codigo_ug',  (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT codigo_ug::text           AS d FROM filtered WHERE codigo_ug                 IS NOT NULL) x),
    'distinct_uo',         (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT codigo_nome_uo            AS d FROM filtered WHERE codigo_nome_uo            IS NOT NULL AND codigo_nome_uo <> '') x),
    'distinct_elemento',   (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT codigo_nome_elemento      AS d FROM filtered WHERE codigo_nome_elemento      IS NOT NULL AND codigo_nome_elemento <> '') x),
    'distinct_favorecido', (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT codigo_nome_favorecido    AS d FROM filtered WHERE codigo_nome_favorecido    IS NOT NULL AND codigo_nome_favorecido <> '') x)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lc131_distincts(integer,text,text,text,text,text,text,text,text,text,text,text,text,text) TO anon, authenticated;


-- ================================================================
-- PASSO 9: lc131_detail — v3 com MV + ANY
-- Retorna rows paginados + total para a tabela de detalhes.
-- ================================================================
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
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = 0
AS $$
DECLARE result json;
BEGIN
  WITH filtered AS (
    SELECT *
    FROM lc131_mv
    WHERE
      (p_ano           IS NULL OR ano_referencia = p_ano)
      AND (p_drs           IS NULL OR drs                       = ANY(string_to_array(p_drs, '|')))
      AND (p_regiao_ad     IS NULL OR regiao_ad                 = ANY(string_to_array(p_regiao_ad, '|')))
      AND (p_rras          IS NULL OR rras                      = ANY(string_to_array(p_rras, '|')))
      AND (p_regiao_sa     IS NULL OR regiao_sa                 = ANY(string_to_array(p_regiao_sa, '|')))
      AND (p_municipio     IS NULL OR municipio                 = ANY(string_to_array(p_municipio, '|')))
      AND (p_grupo_despesa IS NULL OR codigo_nome_grupo         = ANY(string_to_array(p_grupo_despesa, '|')))
      AND (p_tipo_despesa  IS NULL OR tipo_despesa              = ANY(string_to_array(p_tipo_despesa, '|')))
      AND (p_rotulo        IS NULL OR rotulo                    = ANY(string_to_array(p_rotulo, '|')))
      AND (p_fonte_recurso IS NULL OR codigo_nome_fonte_recurso = ANY(string_to_array(p_fonte_recurso, '|')))
      AND (p_codigo_ug     IS NULL OR codigo_ug::text           = ANY(string_to_array(p_codigo_ug, '|')))
      AND (p_uo            IS NULL OR codigo_nome_uo            = ANY(string_to_array(p_uo, '|')))
      AND (p_elemento      IS NULL OR codigo_nome_elemento      = ANY(string_to_array(p_elemento, '|')))
      AND (p_favorecido    IS NULL OR codigo_nome_favorecido    = ANY(string_to_array(p_favorecido, '|')))
  )
  SELECT json_build_object(
    'total', (SELECT COUNT(*) FROM filtered),
    'rows',  (
      SELECT json_agg(r)
      FROM (
        SELECT * FROM filtered
        ORDER BY empenhado DESC NULLS LAST
        LIMIT p_limit OFFSET p_offset
      ) r
    )
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lc131_detail(integer,text,text,text,text,text,text,text,text,text,text,text,text,text,integer,integer) TO anon, authenticated;


-- ================================================================
-- PASSO 10: VALIDAÇÃO
-- ================================================================
-- Após executar, verifique:
--
-- 1. Contagem do MV (deve bater com lc131_despesas):
-- SELECT COUNT(*) FROM lc131_mv;
-- SELECT COUNT(*) FROM lc131_despesas;
--
-- 2. DRS sem símbolos estranhos:
-- SELECT DISTINCT drs FROM lc131_mv WHERE drs IS NOT NULL ORDER BY drs;
--
-- 3. Dashboard rápido (< 2s esperado):
-- SELECT lc131_dashboard();
--
-- 4. Distincts rápido (< 1s esperado):
-- SELECT lc131_distincts();
--
-- 5. Após futuras importações de dados, atualize o MV:
-- SELECT refresh_dashboard();
-- ================================================================
