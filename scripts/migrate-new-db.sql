-- ================================================================
-- MIGRAÇÃO COMPLETA — Novo projeto Supabase
-- teikzwrfsxjipxozzhbr.supabase.co
--
-- Execute TUDO de uma vez no SQL Editor do novo projeto.
-- ================================================================

-- ================================================================
-- PARTE 1: TABELAS
-- ================================================================

-- 1a. Tabela principal LC131
CREATE TABLE IF NOT EXISTS public.lc131_despesas (
  id                              BIGSERIAL PRIMARY KEY,
  ano_referencia                  INTEGER,
  nome_municipio                  TEXT,
  municipio                       TEXT,
  codigo_nome_uo                  TEXT,
  codigo_ug                       NUMERIC,
  codigo_nome_ug                  TEXT,
  codigo_projeto_atividade        TEXT,
  codigo_nome_projeto_atividade   TEXT,
  codigo_nome_fonte_recurso       TEXT,
  codigo_fonte_recursos           TEXT,
  fonte_recurso                   TEXT,
  codigo_nome_grupo               TEXT,
  grupo_despesa                   TEXT,
  codigo_nome_elemento            TEXT,
  codigo_elemento                 TEXT,
  codigo_nome_favorecido          TEXT,
  codigo_favorecido               TEXT,
  descricao_processo              TEXT,
  numero_processo                 TEXT,
  empenhado                       NUMERIC,
  liquidado                       NUMERIC,
  pago                            NUMERIC,
  pago_anos_anteriores            NUMERIC,
  pago_total                      NUMERIC,
  drs                             TEXT,
  regiao_ad                       TEXT,
  rras                            TEXT,
  regiao_sa                       TEXT,
  cod_ibge                        TEXT,
  unidade                         TEXT,
  rotulo                          TEXT,
  tipo_despesa                    TEXT
);

-- 1b. Tabela de referência bd_ref
CREATE TABLE IF NOT EXISTS public.bd_ref (
  id              BIGSERIAL PRIMARY KEY,
  codigo          TEXT        NOT NULL,
  unidade         TEXT,
  drs             TEXT,
  regiao_ad       TEXT,
  rras            TEXT,
  regiao_sa       TEXT,
  cod_ibge        TEXT,
  municipio       TEXT,
  fonte_recurso   TEXT,
  grupo_despesa   TEXT,
  tipo_despesa    TEXT,
  rotulo          TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bd_ref_codigo ON public.bd_ref (codigo);
CREATE INDEX IF NOT EXISTS idx_bd_ref_unidade ON public.bd_ref (unidade);

-- 1c. Tabela DRS
CREATE TABLE IF NOT EXISTS public.tab_drs (
  municipio  TEXT PRIMARY KEY,
  drs        TEXT NOT NULL
);

-- 1d. Tabela RRAS
CREATE TABLE IF NOT EXISTS public.tab_rras (
  municipio  TEXT PRIMARY KEY,
  rras       TEXT NOT NULL
);


-- ================================================================
-- PARTE 2: RLS (Row Level Security)
-- ================================================================

ALTER TABLE public.lc131_despesas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bd_ref ENABLE ROW LEVEL SECURITY;

-- SELECT para leitura
CREATE POLICY anon_read_lc131 ON public.lc131_despesas FOR SELECT TO anon USING (true);
CREATE POLICY anon_read_bd_ref ON public.bd_ref FOR SELECT TO anon USING (true);

-- INSERT para importação via REST API
CREATE POLICY anon_insert_lc131 ON public.lc131_despesas FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY anon_insert_bd_ref ON public.bd_ref FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY anon_insert_tab_drs ON public.tab_drs FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY anon_insert_tab_rras ON public.tab_rras FOR INSERT TO anon WITH CHECK (true);

-- GRANTs
GRANT SELECT, INSERT ON public.lc131_despesas TO anon, authenticated;
GRANT SELECT, INSERT ON public.bd_ref TO anon, authenticated;
GRANT SELECT, INSERT ON public.tab_drs TO anon, authenticated;
GRANT SELECT, INSERT ON public.tab_rras TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;


-- ================================================================
-- PARTE 3: FUNÇÃO AUXILIAR — normaliza nome de município
-- ================================================================

CREATE OR REPLACE FUNCTION public.norm_munic(t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT translate(
    UPPER(TRIM(COALESCE(t, ''))),
    'ÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇÑàáâãäåèéêëìíîïòóôõöùúûüçñ',
    'AAAAAAEEEEIIIIOOOOOUUUUCNaaaaaaeeeeiiiioooooouuuucn'
  );
$$;


-- ================================================================
-- PARTE 4: VIEW lc131_enriquecida
-- ================================================================

DROP VIEW IF EXISTS public.lc131_enriquecida CASCADE;

CREATE VIEW public.lc131_enriquecida AS
SELECT
  lc.id,
  lc.ano_referencia,
  NULLIF(TRIM(COALESCE(td.drs, td2.drs, rb1.drs, rb2.drs, rb3.drs)), '') AS drs,
  NULLIF(TRIM(COALESCE(tr.rras, tr2.rras, rb1.rras, rb2.rras, rb3.rras)), '') AS rras,
  COALESCE(rb1.regiao_ad, rb2.regiao_ad, rb3.regiao_ad) AS regiao_ad,
  COALESCE(rb1.regiao_sa, rb2.regiao_sa, rb3.regiao_sa) AS regiao_sa,
  COALESCE(rb1.cod_ibge,  rb2.cod_ibge,  rb3.cod_ibge)  AS cod_ibge,
  COALESCE(lc.nome_municipio, rb1.municipio, rb2.municipio, rb3.municipio) AS municipio,
  COALESCE(rb1.fonte_recurso, rb2.fonte_recurso, rb3.fonte_recurso) AS fonte_recurso,
  COALESCE(rb1.grupo_despesa, rb2.grupo_despesa, rb3.grupo_despesa) AS grupo_despesa,
  COALESCE(rb1.tipo_despesa,  rb2.tipo_despesa,  rb3.tipo_despesa)  AS tipo_despesa,
  COALESCE(rb1.rotulo,        rb2.rotulo,        rb3.rotulo)        AS rotulo,
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
  lc.empenhado,
  lc.liquidado,
  lc.pago,
  lc.pago_anos_anteriores,
  COALESCE(lc.pago, 0) + COALESCE(lc.pago_anos_anteriores, 0) AS pago_total
FROM public.lc131_despesas lc
LEFT JOIN public.tab_drs td   ON td.municipio  = norm_munic(lc.nome_municipio)
LEFT JOIN public.tab_drs td2  ON td2.municipio = norm_munic(lc.municipio)
LEFT JOIN public.tab_rras tr  ON tr.municipio  = norm_munic(lc.nome_municipio)
LEFT JOIN public.tab_rras tr2 ON tr2.municipio = norm_munic(lc.municipio)
LEFT JOIN public.bd_ref rb1   ON rb1.codigo = LPAD(lc.codigo_projeto_atividade::text, 6, '0')
LEFT JOIN public.bd_ref rb2   ON rb2.codigo = LPAD(lc.codigo_ug::text, 6, '0')
LEFT JOIN public.bd_ref rb3   ON rb3.codigo = LPAD(
    NULLIF(regexp_replace(split_part(lc.codigo_nome_ug::text, ' ', 1), '[^0-9]', '', 'g'), ''),
    6, '0');

GRANT SELECT ON public.lc131_enriquecida TO anon, authenticated;


-- ================================================================
-- PARTE 5: FUNÇÕES OTIMIZADAS (queries diretas, sem view)
-- ================================================================

-- 5a. lc131_dashboard — KPIs + 18 agregações
DROP FUNCTION IF EXISTS public.lc131_dashboard(integer);
DROP FUNCTION IF EXISTS public.lc131_dashboard(integer,text,text,text,text,text,text,text,text,text,text,text,text,text);

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
    SELECT *,
      COALESCE(pago, 0) + COALESCE(pago_anos_anteriores, 0) AS _pt,
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
    'kpis', (
      SELECT json_build_object(
        'empenhado',  SUM(COALESCE(empenhado, 0)),
        'liquidado',  SUM(COALESCE(liquidado, 0)),
        'pago',       SUM(COALESCE(pago, 0)),
        'pago_total', SUM(_pt),
        'total',      COUNT(*),
        'municipios', COUNT(DISTINCT COALESCE(municipio, codigo_ug::text))
      ) FROM base
    ),
    'por_ano', (
      SELECT json_agg(r ORDER BY r.ano) FROM (
        SELECT ano_referencia AS ano,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(COALESCE(liquidado, 0)) AS liquidado,
          SUM(COALESCE(pago, 0))      AS pago,
          SUM(_pt)                    AS pago_total,
          COUNT(*)                    AS registros
        FROM base WHERE ano_referencia IS NOT NULL
        GROUP BY ano_referencia
      ) r
    ),
    'por_grupo', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_grupo AS grupo_despesa,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(COALESCE(liquidado, 0)) AS liquidado,
          SUM(_pt) AS pago_total
        FROM base WHERE codigo_nome_grupo IS NOT NULL AND codigo_nome_grupo <> ''
        GROUP BY codigo_nome_grupo ORDER BY 2 DESC LIMIT 12
      ) r
    ),
    'por_drs', (
      SELECT json_agg(r) FROM (
        SELECT drs,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(COALESCE(liquidado, 0)) AS liquidado,
          SUM(_pt) AS pago_total
        FROM base WHERE drs IS NOT NULL AND drs <> ''
        GROUP BY drs ORDER BY 2 DESC LIMIT 20
      ) r
    ),
    'por_municipio', (
      SELECT json_agg(r) FROM (
        SELECT municipio,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(_pt) AS pago_total
        FROM base WHERE municipio IS NOT NULL AND municipio <> ''
        GROUP BY municipio ORDER BY 2 DESC LIMIT 15
      ) r
    ),
    'por_fonte', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_fonte_recurso AS fonte,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(_pt) AS pago_total
        FROM base WHERE codigo_nome_fonte_recurso IS NOT NULL AND codigo_nome_fonte_recurso <> ''
        GROUP BY codigo_nome_fonte_recurso ORDER BY 2 DESC LIMIT 10
      ) r
    ),
    'por_uo', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_uo AS uo,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(_pt) AS pago_total
        FROM base WHERE codigo_nome_uo IS NOT NULL AND codigo_nome_uo <> ''
        GROUP BY codigo_nome_uo ORDER BY 2 DESC LIMIT 15
      ) r
    ),
    'por_ug', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_ug AS ug,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(_pt) AS pago_total
        FROM base WHERE codigo_nome_ug IS NOT NULL AND codigo_nome_ug <> ''
        GROUP BY codigo_nome_ug ORDER BY 2 DESC LIMIT 15
      ) r
    ),
    'por_elemento', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_elemento AS elemento,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(_pt) AS pago_total
        FROM base WHERE codigo_nome_elemento IS NOT NULL AND codigo_nome_elemento <> ''
        GROUP BY codigo_nome_elemento ORDER BY 2 DESC LIMIT 15
      ) r
    ),
    'por_projeto', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_projeto_atividade AS projeto,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(_pt) AS pago_total
        FROM base WHERE codigo_nome_projeto_atividade IS NOT NULL AND codigo_nome_projeto_atividade <> ''
        GROUP BY codigo_nome_projeto_atividade ORDER BY 2 DESC LIMIT 15
      ) r
    ),
    'por_favorecido', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_favorecido AS favorecido,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(_pt) AS pago_total
        FROM base WHERE codigo_nome_favorecido IS NOT NULL AND codigo_nome_favorecido <> ''
        GROUP BY codigo_nome_favorecido ORDER BY 2 DESC LIMIT 15
      ) r
    ),
    'por_rotulo', (
      SELECT json_agg(r) FROM (
        SELECT rotulo,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(_pt) AS pago_total
        FROM base WHERE rotulo IS NOT NULL AND rotulo <> ''
        GROUP BY rotulo ORDER BY 2 DESC
      ) r
    ),
    'por_tipo_despesa', (
      SELECT json_agg(r) FROM (
        SELECT tipo_despesa,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(_pt) AS pago_total
        FROM base WHERE tipo_despesa IS NOT NULL AND tipo_despesa <> ''
        GROUP BY tipo_despesa ORDER BY 2 DESC
      ) r
    ),
    'por_rras', (
      SELECT json_agg(r) FROM (
        SELECT rras,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(_pt) AS pago_total
        FROM base WHERE rras IS NOT NULL AND rras <> ''
        GROUP BY rras ORDER BY 2 DESC LIMIT 20
      ) r
    ),
    'por_regiao_ad', (
      SELECT json_agg(r) FROM (
        SELECT regiao_ad,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(_pt) AS pago_total
        FROM base WHERE regiao_ad IS NOT NULL AND regiao_ad <> ''
        GROUP BY regiao_ad ORDER BY 2 DESC
      ) r
    ),
    'por_regiao_sa', (
      SELECT json_agg(r) FROM (
        SELECT regiao_sa,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(_pt) AS pago_total
        FROM base WHERE regiao_sa IS NOT NULL AND regiao_sa <> ''
        GROUP BY regiao_sa ORDER BY 2 DESC LIMIT 20
      ) r
    ),
    'por_grupo_simpl', (
      SELECT json_agg(r) FROM (
        SELECT grupo_simpl,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(_pt) AS pago_total
        FROM base
        GROUP BY grupo_simpl ORDER BY 2 DESC
      ) r
    ),
    'por_fonte_simpl', (
      SELECT json_agg(r) FROM (
        SELECT fonte_simpl,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(_pt) AS pago_total
        FROM base
        GROUP BY fonte_simpl ORDER BY 2 DESC
      ) r
    )
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lc131_dashboard(integer,text,text,text,text,text,text,text,text,text,text,text,text,text) TO anon, authenticated;


-- 5b. lc131_distincts — valores únicos para filtros
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
  WITH base AS (
    SELECT *,
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
      END AS fonte_simpl
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
      AND (p_fonte_recurso IS NULL OR fonte_simpl               = ANY(string_to_array(p_fonte_recurso, '|')))
      AND (p_codigo_ug     IS NULL OR codigo_ug::text           = ANY(string_to_array(p_codigo_ug, '|')))
      AND (p_uo            IS NULL OR codigo_nome_uo            = ANY(string_to_array(p_uo, '|')))
      AND (p_elemento      IS NULL OR codigo_nome_elemento      = ANY(string_to_array(p_elemento, '|')))
      AND (p_favorecido    IS NULL OR codigo_nome_favorecido    = ANY(string_to_array(p_favorecido, '|')))
  )
  SELECT json_build_object(
    'anos',       (SELECT json_agg(DISTINCT ano_referencia ORDER BY ano_referencia) FROM base WHERE ano_referencia IS NOT NULL),
    'drs',        (SELECT json_agg(DISTINCT drs ORDER BY drs) FROM base WHERE drs IS NOT NULL AND drs <> ''),
    'regiao_ad',  (SELECT json_agg(DISTINCT regiao_ad ORDER BY regiao_ad) FROM base WHERE regiao_ad IS NOT NULL AND regiao_ad <> ''),
    'rras',       (SELECT json_agg(DISTINCT rras ORDER BY rras) FROM base WHERE rras IS NOT NULL AND rras <> ''),
    'regiao_sa',  (SELECT json_agg(DISTINCT regiao_sa ORDER BY regiao_sa) FROM base WHERE regiao_sa IS NOT NULL AND regiao_sa <> ''),
    'municipios', (SELECT json_agg(DISTINCT municipio ORDER BY municipio) FROM base WHERE municipio IS NOT NULL AND municipio <> ''),
    'grupos',     (SELECT json_agg(DISTINCT codigo_nome_grupo ORDER BY codigo_nome_grupo) FROM base WHERE codigo_nome_grupo IS NOT NULL AND codigo_nome_grupo <> ''),
    'tipo_despesa', (SELECT json_agg(DISTINCT tipo_despesa ORDER BY tipo_despesa) FROM base WHERE tipo_despesa IS NOT NULL AND tipo_despesa <> ''),
    'rotulos',    (SELECT json_agg(DISTINCT rotulo ORDER BY rotulo) FROM base WHERE rotulo IS NOT NULL AND rotulo <> ''),
    'fontes',     (SELECT json_agg(DISTINCT fonte_simpl ORDER BY fonte_simpl) FROM base),
    'ugs',        (SELECT json_agg(DISTINCT codigo_nome_ug ORDER BY codigo_nome_ug) FROM base WHERE codigo_nome_ug IS NOT NULL AND codigo_nome_ug <> ''),
    'uos',        (SELECT json_agg(DISTINCT codigo_nome_uo ORDER BY codigo_nome_uo) FROM base WHERE codigo_nome_uo IS NOT NULL AND codigo_nome_uo <> ''),
    'elementos',  (SELECT json_agg(DISTINCT codigo_nome_elemento ORDER BY codigo_nome_elemento) FROM base WHERE codigo_nome_elemento IS NOT NULL AND codigo_nome_elemento <> ''),
    'favorecidos',(SELECT json_agg(DISTINCT codigo_nome_favorecido ORDER BY codigo_nome_favorecido) FROM base WHERE codigo_nome_favorecido IS NOT NULL AND codigo_nome_favorecido <> '')
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lc131_distincts(integer,text,text,text,text,text,text,text,text,text,text,text,text,text) TO anon, authenticated;


-- 5c. lc131_detail — detalhe paginado
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
               OR codigo_nome_fonte_recurso ILIKE '%união%'
               OR codigo_nome_fonte_recurso ILIKE '%uniao%'
               OR codigo_nome_fonte_recurso ILIKE '%fundo nacional%'
               OR codigo_nome_fonte_recurso ILIKE '%transferência%'
               OR codigo_nome_fonte_recurso ILIKE '%transferencia%'
               OR codigo_nome_fonte_recurso ILIKE '%SUS%' THEN 'Federal'
             ELSE 'Demais Fontes'
           END AS fonte_simpl,
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


-- 5d. lc131_map_data — dados agregados para mapa
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


-- 5e. lc131_delete_year — deleta registros por ano (bypass RLS)
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


-- 5f. refresh_dashboard_batch — enriquece UM batch por vez
CREATE OR REPLACE FUNCTION public.refresh_dashboard_batch(p_batch_size integer DEFAULT 5000)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET statement_timeout = 120000
AS $$
DECLARE rows_affected bigint;
BEGIN
  WITH candidates AS (
    SELECT id FROM lc131_despesas
    WHERE COALESCE(TRIM(drs),'') = ''
       OR COALESCE(TRIM(rotulo),'') = ''
    LIMIT p_batch_size
  ),
  enriched AS (
    SELECT
      lc.id,
      NULLIF(TRIM(COALESCE(td.drs, td2.drs, rb1.drs,  rb2.drs,  rb3.drs)),  '') AS e_drs,
      NULLIF(TRIM(COALESCE(tr.rras, tr2.rras, rb1.rras, rb2.rras, rb3.rras)), '') AS e_rras,
      COALESCE(rb1.regiao_ad,     rb2.regiao_ad,     rb3.regiao_ad)     AS e_regiao_ad,
      COALESCE(rb1.regiao_sa,     rb2.regiao_sa,     rb3.regiao_sa)     AS e_regiao_sa,
      COALESCE(rb1.cod_ibge,      rb2.cod_ibge,      rb3.cod_ibge)      AS e_cod_ibge,
      COALESCE(lc.nome_municipio, rb1.municipio, rb2.municipio, rb3.municipio) AS e_municipio,
      COALESCE(rb1.unidade,       rb2.unidade,       rb3.unidade)       AS e_unidade,
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
    LEFT JOIN tab_drs  td   ON td.municipio  = norm_munic(lc.nome_municipio)
    LEFT JOIN tab_drs  td2  ON td2.municipio = norm_munic(lc.municipio)
    LEFT JOIN tab_rras tr   ON tr.municipio  = norm_munic(lc.nome_municipio)
    LEFT JOIN tab_rras tr2  ON tr2.municipio = norm_munic(lc.municipio)
    LEFT JOIN bd_ref   rb1 ON rb1.codigo = LPAD(lc.codigo_projeto_atividade::text, 6, '0')
    LEFT JOIN bd_ref   rb2 ON rb2.codigo = LPAD(lc.codigo_ug::text, 6, '0')
    LEFT JOIN bd_ref   rb3 ON rb3.codigo = LPAD(
        NULLIF(regexp_replace(split_part(lc.codigo_nome_ug::text, ' ', 1), '[^0-9]', '', 'g'), ''),
        6, '0')
  )
  UPDATE lc131_despesas tgt
  SET
    drs           = COALESCE(enriched.e_drs,           NULLIF(TRIM(tgt.drs),'')),
    rras          = COALESCE(enriched.e_rras,          NULLIF(TRIM(tgt.rras),'')),
    regiao_ad     = COALESCE(enriched.e_regiao_ad,     NULLIF(TRIM(tgt.regiao_ad),'')),
    regiao_sa     = COALESCE(enriched.e_regiao_sa,     NULLIF(TRIM(tgt.regiao_sa),'')),
    cod_ibge      = COALESCE(enriched.e_cod_ibge,      NULLIF(TRIM(tgt.cod_ibge),'')),
    municipio     = COALESCE(enriched.e_municipio,     NULLIF(TRIM(tgt.municipio),'')),
    unidade       = COALESCE(enriched.e_unidade,       NULLIF(TRIM(tgt.unidade),'')),
    fonte_recurso = COALESCE(enriched.e_fonte_recurso, NULLIF(TRIM(tgt.fonte_recurso),'')),
    grupo_despesa = COALESCE(enriched.e_grupo_despesa, NULLIF(TRIM(tgt.grupo_despesa),'')),
    tipo_despesa  = COALESCE(enriched.e_tipo_despesa,  NULLIF(TRIM(tgt.tipo_despesa),'')),
    rotulo        = COALESCE(enriched.e_rotulo,        NULLIF(TRIM(tgt.rotulo),'')),
    pago_total    = COALESCE(tgt.pago, 0) + COALESCE(tgt.pago_anos_anteriores, 0)
  FROM enriched
  WHERE tgt.id = enriched.id;

  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_dashboard_batch(integer) TO anon, authenticated;


-- 5g. refresh_dashboard — processa TODOS os batches automaticamente
CREATE OR REPLACE FUNCTION public.refresh_dashboard()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET statement_timeout = 0
AS $$
DECLARE
  batch_size int := 10000;
  total_updated bigint := 0;
  rows_affected bigint;
BEGIN
  LOOP
    SELECT public.refresh_dashboard_batch(batch_size) INTO rows_affected;
    total_updated := total_updated + rows_affected;
    EXIT WHEN rows_affected = 0;
  END LOOP;
  RAISE NOTICE 'refresh_dashboard: % registros atualizados', total_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_dashboard() TO anon, authenticated;


-- ================================================================
-- PARTE 6: Seed bd_ref (100 códigos iniciais)
-- ================================================================

INSERT INTO public.bd_ref
  (codigo, unidade, drs, regiao_ad, rras, regiao_sa, cod_ibge, municipio, fonte_recurso, grupo_despesa, tipo_despesa, rotulo)
VALUES
  ('090033', 'FED-CTO. REABILITACAO DE CASA BRANCA', 'DRS XIV - São João da Boa Vista', 'CAMPINAS', '15', 'Rio Pardo', '351080', 'CASA BRANCA', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090037', 'FED-INSTITUTO ADOLFO LUTZ', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090038', 'FED-INSTITUTO BUTANTAN', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090040', 'FED - INSTITUTO DE SAUDE', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090041', 'FED-INST.DANTE PAZZANESE DE CARDIOLOGIA', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090043', 'FED-INST.INFECTOLOGIA EMILIO RIBAS', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090101', 'GABINETE DO SECRETARIO E ASSESSORIAS', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'TRANFERÊNCIA VOLUNTÁRIA', NULL),
  ('090102', 'COORD. GERAL ADMINIST. - CGA', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'TRANFERÊNCIA VOLUNTÁRIA', NULL),
  ('090105', 'COORD. RECURSOS HUMANOS - CRH', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'TRANFERÊNCIA VOLUNTÁRIA', NULL),
  ('090107', 'CTO. VIGILANCIA SANITARIA', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090109', 'CENTRO DE REFERENCIA DA SAUDE DA MULHER', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090110', 'CTO. REFERENCIA E TREINAMENTO-DST/AIDS', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090196', 'COORD. DE GESTAO ORCAMENTARIA E FINANCEIRA', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'CONVÊNIO', NULL)
ON CONFLICT (codigo) DO UPDATE SET
  unidade      = EXCLUDED.unidade,
  drs          = EXCLUDED.drs,
  regiao_ad    = EXCLUDED.regiao_ad,
  rras         = EXCLUDED.rras,
  regiao_sa    = EXCLUDED.regiao_sa,
  cod_ibge     = EXCLUDED.cod_ibge,
  municipio    = EXCLUDED.municipio,
  tipo_despesa = EXCLUDED.tipo_despesa;


-- ================================================================
-- PARTE 7: Notify PostgREST to reload schema cache
-- ================================================================

NOTIFY pgrst, 'reload schema';
