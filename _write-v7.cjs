const fs = require('fs');

const sql = `-- ================================================================
-- fix_tipo_despesa_by_year(p_ano INT)  — versão 7.0
-- PROCX UG-first: a Unidade Gestora é o discriminador primário,
-- pois cada UG pertence a um tipo de organização específico.
-- Cascade de 4 níveis de especificidade:
--   L1: (ug + descricao + projeto)  — máxima especificidade
--   L2: (ug + descricao)
--   L3: (ug + projeto)
--   L4: (ug)              — tipo majoritário da UG
--   Fallback: mantém valor existente
-- ================================================================

-- ─ 1. Dropa objetos anteriores ────────────────────────────────────
DROP TABLE    IF EXISTS public.bd_ref              CASCADE;
DROP FUNCTION IF EXISTS public.fix_tipo_despesa_by_year(INT);
DROP FUNCTION IF EXISTS public.fix_tipo_despesa_by_year(INT, BIGINT, BIGINT);
DROP FUNCTION IF EXISTS public.lookup_tipo_bdref(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT);
DROP FUNCTION IF EXISTS public.refresh_bdref_lookup();
DROP TABLE    IF EXISTS public.bd_ref_lookup_full  CASCADE;
DROP TABLE    IF EXISTS public.bd_ref_lookup_desc  CASCADE;
DROP TABLE    IF EXISTS public.bd_ref_lookup_proj  CASCADE;
DROP TABLE    IF EXISTS public.bd_ref_lookup_l1    CASCADE;
DROP TABLE    IF EXISTS public.bd_ref_lookup_l2    CASCADE;
DROP TABLE    IF EXISTS public.bd_ref_lookup_l3    CASCADE;
DROP TABLE    IF EXISTS public.bd_ref_lookup_l4    CASCADE;

-- ─ 2. Tabelas de lookup ───────────────────────────────────────────

-- L1: (ug, descricao_processo, projeto) — maior especificidade
CREATE TABLE public.bd_ref_lookup_l1 (
  codigo_nome_ug                TEXT NOT NULL,
  descricao_processo            TEXT NOT NULL,
  codigo_nome_projeto_atividade TEXT NOT NULL,
  tipo_despesa                  TEXT NOT NULL,
  PRIMARY KEY (codigo_nome_ug, descricao_processo, codigo_nome_projeto_atividade)
);

-- L2: (ug, descricao_processo)
CREATE TABLE public.bd_ref_lookup_l2 (
  codigo_nome_ug     TEXT NOT NULL,
  descricao_processo TEXT NOT NULL,
  tipo_despesa       TEXT NOT NULL,
  PRIMARY KEY (codigo_nome_ug, descricao_processo)
);

-- L3: (ug, projeto)
CREATE TABLE public.bd_ref_lookup_l3 (
  codigo_nome_ug                TEXT NOT NULL,
  codigo_nome_projeto_atividade TEXT NOT NULL,
  tipo_despesa                  TEXT NOT NULL,
  PRIMARY KEY (codigo_nome_ug, codigo_nome_projeto_atividade)
);

-- L4: (ug) — tipo majoritário da UG
CREATE TABLE public.bd_ref_lookup_l4 (
  codigo_nome_ug TEXT PRIMARY KEY NOT NULL,
  tipo_despesa   TEXT NOT NULL
);

-- ─ 3. Índices em lc131_despesas ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lc131_ano_id
  ON public.lc131_despesas (ano_referencia, id);

CREATE INDEX IF NOT EXISTS idx_lc131_ug_desc_proj
  ON public.lc131_despesas (codigo_nome_ug, descricao_processo, codigo_nome_projeto_atividade);

-- ─ 4. refresh_bdref_lookup() ─────────────────────────────────────
-- Popula L1–L4 a partir de bd_ref_tipo.
-- Executar após qualquer reimportação de bd_ref_tipo.
CREATE FUNCTION public.refresh_bdref_lookup()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n1 INT; n2 INT; n3 INT; n4 INT;
BEGIN
  -- L1: tipo mais frequente por (ug + desc + proj)
  TRUNCATE TABLE public.bd_ref_lookup_l1;
  INSERT INTO public.bd_ref_lookup_l1
    (codigo_nome_ug, descricao_processo, codigo_nome_projeto_atividade, tipo_despesa)
  SELECT DISTINCT ON (codigo_nome_ug, descricao_processo, codigo_nome_projeto_atividade)
    codigo_nome_ug, descricao_processo, codigo_nome_projeto_atividade, tipo_despesa
  FROM (
    SELECT codigo_nome_ug, descricao_processo, codigo_nome_projeto_atividade,
           tipo_despesa, count(*) AS cnt
    FROM   bd_ref_tipo
    WHERE  codigo_nome_ug IS NOT NULL
      AND  descricao_processo IS NOT NULL
      AND  codigo_nome_projeto_atividade IS NOT NULL
      AND  tipo_despesa IS NOT NULL
    GROUP BY codigo_nome_ug, descricao_processo, codigo_nome_projeto_atividade, tipo_despesa
  ) g
  ORDER BY codigo_nome_ug, descricao_processo, codigo_nome_projeto_atividade,
           cnt DESC, tipo_despesa;
  GET DIAGNOSTICS n1 = ROW_COUNT;

  -- L2: tipo mais frequente por (ug + desc)
  TRUNCATE TABLE public.bd_ref_lookup_l2;
  INSERT INTO public.bd_ref_lookup_l2
    (codigo_nome_ug, descricao_processo, tipo_despesa)
  SELECT DISTINCT ON (codigo_nome_ug, descricao_processo)
    codigo_nome_ug, descricao_processo, tipo_despesa
  FROM (
    SELECT codigo_nome_ug, descricao_processo, tipo_despesa, count(*) AS cnt
    FROM   bd_ref_tipo
    WHERE  codigo_nome_ug IS NOT NULL
      AND  descricao_processo IS NOT NULL
      AND  tipo_despesa IS NOT NULL
    GROUP BY codigo_nome_ug, descricao_processo, tipo_despesa
  ) g
  ORDER BY codigo_nome_ug, descricao_processo, cnt DESC, tipo_despesa;
  GET DIAGNOSTICS n2 = ROW_COUNT;

  -- L3: tipo mais frequente por (ug + proj)
  TRUNCATE TABLE public.bd_ref_lookup_l3;
  INSERT INTO public.bd_ref_lookup_l3
    (codigo_nome_ug, codigo_nome_projeto_atividade, tipo_despesa)
  SELECT DISTINCT ON (codigo_nome_ug, codigo_nome_projeto_atividade)
    codigo_nome_ug, codigo_nome_projeto_atividade, tipo_despesa
  FROM (
    SELECT codigo_nome_ug, codigo_nome_projeto_atividade, tipo_despesa, count(*) AS cnt
    FROM   bd_ref_tipo
    WHERE  codigo_nome_ug IS NOT NULL
      AND  codigo_nome_projeto_atividade IS NOT NULL
      AND  tipo_despesa IS NOT NULL
    GROUP BY codigo_nome_ug, codigo_nome_projeto_atividade, tipo_despesa
  ) g
  ORDER BY codigo_nome_ug, codigo_nome_projeto_atividade, cnt DESC, tipo_despesa;
  GET DIAGNOSTICS n3 = ROW_COUNT;

  -- L4: tipo majoritário por ug
  TRUNCATE TABLE public.bd_ref_lookup_l4;
  INSERT INTO public.bd_ref_lookup_l4 (codigo_nome_ug, tipo_despesa)
  SELECT DISTINCT ON (codigo_nome_ug)
    codigo_nome_ug, tipo_despesa
  FROM (
    SELECT codigo_nome_ug, tipo_despesa, count(*) AS cnt
    FROM   bd_ref_tipo
    WHERE  codigo_nome_ug IS NOT NULL
      AND  tipo_despesa IS NOT NULL
    GROUP BY codigo_nome_ug, tipo_despesa
  ) g
  ORDER BY codigo_nome_ug, cnt DESC, tipo_despesa;
  GET DIAGNOSTICS n4 = ROW_COUNT;

  ANALYZE public.bd_ref_lookup_l1;
  ANALYZE public.bd_ref_lookup_l2;
  ANALYZE public.bd_ref_lookup_l3;
  ANALYZE public.bd_ref_lookup_l4;

  RETURN json_build_object(
    'l1_ug_desc_proj', n1,
    'l2_ug_desc',      n2,
    'l3_ug_proj',      n3,
    'l4_ug',           n4
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_bdref_lookup() TO anon, authenticated;

-- Popula os lookups imediatamente
SELECT public.refresh_bdref_lookup() AS lookup_stats;

-- ─ 5. fix_tipo_despesa_by_year() ──────────────────────────────────
-- UPDATE set-based puro: 4 LEFT JOINs contra tabelas com PRIMARY KEY.
-- Sem LIKE, sem funções por linha. Máxima performance.
CREATE FUNCTION public.fix_tipo_despesa_by_year(
  p_ano     INT,
  p_id_min  BIGINT DEFAULT NULL,
  p_id_max  BIGINT DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = 0
AS $$
DECLARE
  n INTEGER;
BEGIN
  UPDATE public.lc131_despesas d
  SET tipo_despesa = src.novo_tipo
  FROM (
    SELECT
      lc.ctid,
      COALESCE(
        r1.tipo_despesa,  -- L1: ug + descricao + projeto (mais específico)
        r2.tipo_despesa,  -- L2: ug + descricao
        r3.tipo_despesa,  -- L3: ug + projeto
        r4.tipo_despesa,  -- L4: ug (majoritário da UG)
        lc.tipo_despesa   -- sem match: mantém existente
      ) AS novo_tipo
    FROM public.lc131_despesas lc
    LEFT JOIN public.bd_ref_lookup_l1 r1
      ON  r1.codigo_nome_ug                = lc.codigo_nome_ug
      AND r1.descricao_processo            = lc.descricao_processo
      AND r1.codigo_nome_projeto_atividade = lc.codigo_nome_projeto_atividade
    LEFT JOIN public.bd_ref_lookup_l2 r2
      ON  r2.codigo_nome_ug     = lc.codigo_nome_ug
      AND r2.descricao_processo = lc.descricao_processo
    LEFT JOIN public.bd_ref_lookup_l3 r3
      ON  r3.codigo_nome_ug                = lc.codigo_nome_ug
      AND r3.codigo_nome_projeto_atividade = lc.codigo_nome_projeto_atividade
    LEFT JOIN public.bd_ref_lookup_l4 r4
      ON  r4.codigo_nome_ug = lc.codigo_nome_ug
    WHERE lc.ano_referencia = p_ano
      AND (p_id_min IS NULL OR lc.id >= p_id_min)
      AND (p_id_max IS NULL OR lc.id <= p_id_max)
  ) src
  WHERE d.ctid = src.ctid
    AND d.tipo_despesa IS DISTINCT FROM src.novo_tipo;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN json_build_object(
    'updated', n,
    'ano',     p_ano,
    'id_min',  p_id_min,
    'id_max',  p_id_max
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fix_tipo_despesa_by_year(INT, BIGINT, BIGINT) TO anon, authenticated;

-- ─ 6. get_lc131_id_range() (inalterado) ──────────────────────────
CREATE OR REPLACE FUNCTION public.get_lc131_id_range(p_ano INT)
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path    = public
  SET statement_timeout = 0
AS $$
  SELECT json_build_object(
    'min_id', MIN(id),
    'max_id', MAX(id),
    'total',  COUNT(*)
  )
  FROM public.lc131_despesas
  WHERE ano_referencia = p_ano;
$$;

GRANT EXECUTE ON FUNCTION public.get_lc131_id_range(INT) TO anon, authenticated;

SELECT 'fix_tipo_despesa_by_year v7.0 (UG-first PROCX) criada com sucesso' AS status;
`;

fs.writeFileSync('scripts/fix-tipo-by-year.sql', sql, 'utf8');
console.log('OK - bytes:', Buffer.byteLength(sql, 'utf8'), '| lines:', sql.split('\n').length);
