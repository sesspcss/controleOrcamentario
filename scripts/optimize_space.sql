-- ================================================================
-- OTIMIZAÇÃO DE ESPAÇO — Supabase Free Tier (0.5 GB)
-- ================================================================
-- PROBLEMA: 0.68 GB (135% do limite)
-- CAUSA: lc131_mv duplica 464k rows + 17 índices
-- SOLUÇÃO: Denormalizar dados de enriquecimento em lc131_despesas
--          e ELIMINAR o MV + índices pesados
--
-- Economia estimada: ~350 MB
--   • MV lc131_mv data:     ~200 MB (eliminar)
--   • MV 17 índices:        ~100 MB (eliminar)
--   • Índices base pesados:  ~50 MB (eliminar)
--   • Novas colunas:        - 40 MB (custo)
--   = LÍQUIDO:              ~310 MB economia
--   → De 0.68 GB → ~0.37 GB (dentro do limite!)
--
-- EXECUÇÃO: Cole tudo no Supabase SQL Editor e execute.
-- ================================================================

SET statement_timeout = 0;


-- ════════════════════════════════════════════════════════════════
-- FASE 1: ELIMINAR MATERIALIZED VIEW (maior economia ~ 300+ MB)
-- ════════════════════════════════════════════════════════════════

-- Drop funções que referenciam o MV
DROP FUNCTION IF EXISTS public.lc131_dashboard(integer);
DROP FUNCTION IF EXISTS public.lc131_dashboard(integer,text,text,text,text,text,text,text,text,text,text,text,text,text);
DROP FUNCTION IF EXISTS public.lc131_distincts(integer,text,text,text,text,text,text,text,text,text,text);
DROP FUNCTION IF EXISTS public.lc131_distincts(integer,text,text,text,text,text,text,text,text,text,text,text,text,text);
DROP FUNCTION IF EXISTS public.lc131_detail(integer,text,text,text,text,text,text,text,text,text,text,integer,integer);
DROP FUNCTION IF EXISTS public.lc131_detail(integer,text,text,text,text,text,text,text,text,text,text,text,text,text,integer,integer);
DROP FUNCTION IF EXISTS public.refresh_dashboard();
DROP FUNCTION IF EXISTS public._fix_mojibake(text);

-- DROP MV — libera imediatamente ~300 MB (dados + 17 índices)
DROP MATERIALIZED VIEW IF EXISTS public.lc131_mv CASCADE;
DROP VIEW IF EXISTS public.lc131_enriquecida CASCADE;


-- ════════════════════════════════════════════════════════════════
-- FASE 2: ADICIONAR COLUNAS DE ENRIQUECIMENTO em lc131_despesas
-- São colunas text opcionais (~40 MB para 464k rows, quase nada)
-- ════════════════════════════════════════════════════════════════

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


-- ════════════════════════════════════════════════════════════════
-- FASE 3: POPULAR COLUNAS DE ENRIQUECIMENTO (usa índices existentes)
-- Mesmo JOIN do MV, mas em UPDATE direto — roda uma vez.
-- ════════════════════════════════════════════════════════════════

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


-- ════════════════════════════════════════════════════════════════
-- FASE 4: ELIMINAR ÍNDICES PESADOS (já não faz JOINs em runtime)
-- Cada índice em 464k rows ocupa 5-20 MB.
-- ════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS idx_lc131_cod_nome_ug_prefix;   -- expression index ~20 MB
DROP INDEX IF EXISTS idx_lc131_cod_projeto;           -- JOIN 1, não precisa mais
DROP INDEX IF EXISTS idx_lc131_cod_ug;                -- JOIN 2, não precisa mais
DROP INDEX IF EXISTS idx_lc131_nome_municipio;        -- JOIN tab_drs, não precisa
DROP INDEX IF EXISTS idx_lc131_ano_municipio;         -- composto, raramente usado
DROP INDEX IF EXISTS idx_lc131_ano_cod_projeto;       -- composto, raramente usado
DROP INDEX IF EXISTS idx_lc131_codigo_nome_grupo;     -- menos útil sem MV
DROP INDEX IF EXISTS idx_lc131_codigo_nome_fonte;     -- menos útil sem MV
DROP INDEX IF EXISTS idx_lc131_codigo_nome_elemento;  -- menos útil sem MV
DROP INDEX IF EXISTS idx_lc131_codigo_nome_favorecido;-- menos útil sem MV
DROP INDEX IF EXISTS idx_tab_drs_municipio;           -- PK já indexa
DROP INDEX IF EXISTS idx_tab_rras_municipio;          -- PK já indexa

-- Mantém apenas: idx_lc131_ano + idx_lc131_empenhado (essenciais)

-- Adiciona um índice no DRS (filtro mais usado pelo usuário)
CREATE INDEX IF NOT EXISTS idx_lc131_drs
  ON public.lc131_despesas (drs) WHERE drs IS NOT NULL AND drs <> '';


-- ════════════════════════════════════════════════════════════════
-- FASE 5: VIEW DE COMPATIBILIDADE (zero espaço)
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.lc131_enriquecida AS
  SELECT * FROM public.lc131_despesas;

GRANT SELECT ON public.lc131_enriquecida TO anon, authenticated;
GRANT SELECT ON public.lc131_despesas    TO anon, authenticated;
GRANT SELECT ON public.bd_ref            TO anon, authenticated;


-- ════════════════════════════════════════════════════════════════
-- FASE 6: FUNÇÕES RPC v4 — Consulta lc131_despesas direta
-- Sem JOINs, sem MV, mesma interface JSON, mesma assinatura.
-- ════════════════════════════════════════════════════════════════

-- ── 6a. lc131_dashboard ──────────────────────────────────────────
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
    SELECT *,
           COALESCE(pago, 0) + COALESCE(pago_anos_anteriores, 0) AS _pt
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
      AND (p_fonte_recurso IS NULL OR codigo_nome_fonte_recurso = ANY(string_to_array(p_fonte_recurso, '|')))
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
        SELECT ano_referencia::int AS ano,
          SUM(COALESCE(empenhado,0)) AS empenhado,
          SUM(COALESCE(liquidado,0)) AS liquidado,
          SUM(COALESCE(pago,0))      AS pago,
          SUM(_pt)                   AS pago_total,
          COUNT(*)                   AS registros
        FROM base WHERE ano_referencia IS NOT NULL
        GROUP BY ano_referencia
      ) r
    ),
    'por_grupo', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_grupo AS grupo_despesa,
          SUM(COALESCE(empenhado,0)) AS empenhado,
          SUM(COALESCE(liquidado,0)) AS liquidado,
          SUM(_pt)                   AS pago_total
        FROM base WHERE codigo_nome_grupo IS NOT NULL AND codigo_nome_grupo<>''
        GROUP BY codigo_nome_grupo ORDER BY 2 DESC LIMIT 12
      ) r
    ),
    'por_drs', (
      SELECT json_agg(r) FROM (
        SELECT drs,
          SUM(COALESCE(empenhado,0)) AS empenhado,
          SUM(COALESCE(liquidado,0)) AS liquidado,
          SUM(_pt)                   AS pago_total
        FROM base WHERE drs IS NOT NULL AND drs<>''
        GROUP BY drs ORDER BY 2 DESC LIMIT 20
      ) r
    ),
    'por_municipio', (
      SELECT json_agg(r) FROM (
        SELECT municipio,
          SUM(COALESCE(empenhado,0)) AS empenhado,
          SUM(_pt)                   AS pago_total
        FROM base WHERE municipio IS NOT NULL AND municipio<>''
        GROUP BY municipio ORDER BY 2 DESC LIMIT 15
      ) r
    ),
    'por_fonte', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_fonte_recurso AS fonte_recurso,
          SUM(COALESCE(empenhado,0)) AS empenhado,
          SUM(_pt)                   AS pago_total
        FROM base WHERE codigo_nome_fonte_recurso IS NOT NULL AND codigo_nome_fonte_recurso<>''
        GROUP BY codigo_nome_fonte_recurso ORDER BY 2 DESC LIMIT 12
      ) r
    ),
    'por_elemento', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_elemento AS elemento,
          SUM(COALESCE(empenhado,0)) AS empenhado,
          SUM(_pt)                   AS pago_total
        FROM base WHERE codigo_nome_elemento IS NOT NULL AND codigo_nome_elemento<>''
        GROUP BY codigo_nome_elemento ORDER BY 2 DESC LIMIT 12
      ) r
    ),
    'por_regiao_ad', (
      SELECT json_agg(r) FROM (
        SELECT regiao_ad,
          SUM(COALESCE(empenhado,0)) AS empenhado,
          SUM(_pt)                   AS pago_total
        FROM base WHERE regiao_ad IS NOT NULL AND regiao_ad<>''
        GROUP BY regiao_ad ORDER BY 2 DESC LIMIT 20
      ) r
    ),
    'por_uo', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_uo AS uo,
          SUM(COALESCE(empenhado,0)) AS empenhado,
          SUM(COALESCE(liquidado,0)) AS liquidado,
          SUM(_pt)                   AS pago_total
        FROM base WHERE codigo_nome_uo IS NOT NULL AND codigo_nome_uo<>''
        GROUP BY codigo_nome_uo ORDER BY 2 DESC LIMIT 15
      ) r
    ),
    'por_rras', (
      SELECT json_agg(r) FROM (
        SELECT rras,
          SUM(COALESCE(empenhado,0)) AS empenhado,
          SUM(COALESCE(liquidado,0)) AS liquidado,
          SUM(_pt)                   AS pago_total
        FROM base WHERE rras IS NOT NULL AND rras<>''
        GROUP BY rras ORDER BY 2 DESC LIMIT 20
      ) r
    ),
    'por_tipo_despesa', (
      SELECT json_agg(r) FROM (
        SELECT tipo_despesa,
          SUM(COALESCE(empenhado,0)) AS empenhado,
          SUM(COALESCE(liquidado,0)) AS liquidado,
          SUM(_pt)                   AS pago_total
        FROM base WHERE tipo_despesa IS NOT NULL AND tipo_despesa<>''
        GROUP BY tipo_despesa ORDER BY 2 DESC LIMIT 12
      ) r
    ),
    'por_rotulo', (
      SELECT json_agg(r) FROM (
        SELECT rotulo,
          SUM(COALESCE(empenhado,0)) AS empenhado,
          SUM(_pt)                   AS pago_total
        FROM base WHERE rotulo IS NOT NULL AND rotulo<>''
        GROUP BY rotulo ORDER BY 2 DESC LIMIT 12
      ) r
    ),
    'por_favorecido', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_favorecido AS favorecido,
          SUM(COALESCE(empenhado,0)) AS empenhado,
          SUM(_pt)                   AS pago_total,
          COUNT(*)                   AS contratos
        FROM base WHERE codigo_nome_favorecido IS NOT NULL AND codigo_nome_favorecido<>''
        GROUP BY codigo_nome_favorecido ORDER BY 2 DESC LIMIT 20
      ) r
    ),
    'por_projeto', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_projeto_atividade AS projeto,
          SUM(COALESCE(empenhado,0)) AS empenhado,
          SUM(_pt)                   AS pago_total,
          COUNT(*)                   AS registros
        FROM base WHERE codigo_nome_projeto_atividade IS NOT NULL AND codigo_nome_projeto_atividade<>''
        GROUP BY codigo_nome_projeto_atividade ORDER BY 2 DESC LIMIT 20
      ) r
    ),
    'por_ug', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_ug AS ug,
          SUM(COALESCE(empenhado,0)) AS empenhado,
          SUM(_pt)                   AS pago_total
        FROM base WHERE codigo_nome_ug IS NOT NULL AND codigo_nome_ug<>''
        GROUP BY codigo_nome_ug ORDER BY 2 DESC LIMIT 15
      ) r
    ),
    'por_regiao_sa', (
      SELECT json_agg(r) FROM (
        SELECT regiao_sa,
          SUM(COALESCE(empenhado,0)) AS empenhado,
          SUM(_pt)                   AS pago_total
        FROM base WHERE regiao_sa IS NOT NULL AND regiao_sa<>''
        GROUP BY regiao_sa ORDER BY 2 DESC LIMIT 20
      ) r
    )
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lc131_dashboard(integer,text,text,text,text,text,text,text,text,text,text,text,text,text) TO anon, authenticated;


-- ── 6b. lc131_distincts ──────────────────────────────────────────
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
      AND (p_fonte_recurso IS NULL OR codigo_nome_fonte_recurso = ANY(string_to_array(p_fonte_recurso, '|')))
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
    'distinct_fonte',      (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT codigo_nome_fonte_recurso AS d FROM filtered WHERE codigo_nome_fonte_recurso IS NOT NULL AND codigo_nome_fonte_recurso<>'') x),
    'distinct_codigo_ug',  (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT codigo_ug::text           AS d FROM filtered WHERE codigo_ug IS NOT NULL) x),
    'distinct_uo',         (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT codigo_nome_uo            AS d FROM filtered WHERE codigo_nome_uo IS NOT NULL AND codigo_nome_uo<>'') x),
    'distinct_elemento',   (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT codigo_nome_elemento      AS d FROM filtered WHERE codigo_nome_elemento IS NOT NULL AND codigo_nome_elemento<>'') x),
    'distinct_favorecido', (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT codigo_nome_favorecido    AS d FROM filtered WHERE codigo_nome_favorecido IS NOT NULL AND codigo_nome_favorecido<>'') x)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lc131_distincts(integer,text,text,text,text,text,text,text,text,text,text,text,text,text) TO anon, authenticated;


-- ── 6c. lc131_detail ─────────────────────────────────────────────
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
    SELECT *,
           COALESCE(pago, 0) + COALESCE(pago_anos_anteriores, 0) AS _pt
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
      AND (p_fonte_recurso IS NULL OR codigo_nome_fonte_recurso = ANY(string_to_array(p_fonte_recurso, '|')))
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
          codigo_nome_fonte_recurso, fonte_recurso,
          codigo_nome_grupo, grupo_despesa,
          codigo_nome_elemento, codigo_elemento,
          tipo_despesa, rotulo,
          codigo_nome_favorecido, codigo_favorecido,
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


-- ── 6d. refresh_dashboard — re-enriquece após importações ────────
CREATE OR REPLACE FUNCTION public.refresh_dashboard()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = 0
AS $$
BEGIN
  UPDATE lc131_despesas tgt
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
      NULLIF(TRIM(COALESCE(td.drs,  rb1.drs,  rb2.drs,  rb3.drs)),  '') AS e_drs,
      NULLIF(TRIM(COALESCE(tr.rras, rb1.rras, rb2.rras, rb3.rras)), '') AS e_rras,
      COALESCE(rb1.regiao_ad,     rb2.regiao_ad,     rb3.regiao_ad)     AS e_regiao_ad,
      COALESCE(rb1.regiao_sa,     rb2.regiao_sa,     rb3.regiao_sa)     AS e_regiao_sa,
      COALESCE(rb1.cod_ibge,      rb2.cod_ibge,      rb3.cod_ibge)      AS e_cod_ibge,
      COALESCE(lc.nome_municipio, rb1.municipio, rb2.municipio, rb3.municipio) AS e_municipio,
      COALESCE(rb1.fonte_recurso, rb2.fonte_recurso, rb3.fonte_recurso) AS e_fonte_recurso,
      COALESCE(rb1.grupo_despesa, rb2.grupo_despesa, rb3.grupo_despesa) AS e_grupo_despesa,
      COALESCE(rb1.tipo_despesa,  rb2.tipo_despesa,  rb3.tipo_despesa)  AS e_tipo_despesa,
      COALESCE(rb1.rotulo,        rb2.rotulo,        rb3.rotulo)        AS e_rotulo
    FROM lc131_despesas lc
    LEFT JOIN tab_drs  td  ON td.municipio = lc.nome_municipio
    LEFT JOIN tab_rras tr  ON tr.municipio = lc.nome_municipio
    LEFT JOIN bd_ref   rb1 ON rb1.codigo = lc.codigo_projeto_atividade::text
    LEFT JOIN bd_ref   rb2 ON rb2.codigo = lc.codigo_ug::text
    LEFT JOIN bd_ref   rb3 ON rb3.codigo = NULLIF(regexp_replace(
        split_part(lc.codigo_nome_ug::text, ' ', 1), '[^0-9]', '', 'g'), '')
  ) sub
  WHERE tgt.id = sub.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_dashboard() TO anon, authenticated;


-- ════════════════════════════════════════════════════════════════
-- FASE 7: RECUPERAR ESPAÇO
-- VACUUM libera dead tuples do UPDATE.
-- ════════════════════════════════════════════════════════════════
VACUUM public.lc131_despesas;


-- ════════════════════════════════════════════════════════════════
-- VALIDAÇÃO
-- ════════════════════════════════════════════════════════════════
-- 1. Tamanho do banco (deve cair de 0.68 para ~0.35 GB):
--    SELECT pg_size_pretty(pg_database_size(current_database()));
--
-- 2. DRS populado:
--    SELECT DISTINCT drs FROM lc131_despesas
--    WHERE drs IS NOT NULL ORDER BY drs;
--
-- 3. Dashboard funciona:
--    SELECT lc131_dashboard();
--
-- 4. Distincts funciona:
--    SELECT lc131_distincts();
-- ════════════════════════════════════════════════════════════════
