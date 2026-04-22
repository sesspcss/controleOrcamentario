-- ================================================================
-- create-pivot-multi-fn.sql — Tabela Dinâmica multi-nível
-- Deploy UMA VEZ no Supabase SQL Editor antes de usar a nova pivot.
--
-- O QUE FAZ:
--   Cria a função lc131_pivot_multi que aceita até 4 dimensões de
--   agrupamento e retorna dados agregados por ano — exatamente como
--   uma Tabela Dinâmica do Excel, com qualquer hierarquia de campos.
--
-- DIMENSÕES SUPORTADAS (p_dim1 ... p_dim4):
--   'municipio'    → município do gasto
--   'drs'          → Departamento Regional de Saúde
--   'rras'         → Região de Referência em Assistência à Saúde
--   'regiao_ad'    → Região Administrativa
--   'regiao_sa'    → Região de Saúde
--   'fonte_simpl'  → ESTADUAL ou FEDERAL (calculado)
--   'grupo_simpl'  → CUSTEIO / INVESTIMENTO / PESSOAL (calculado)
--   'tipo_despesa' → tipo de despesa
--   'rotulo'       → rótulo do projeto/atividade
--   'grupo_despesa'→ código+nome do grupo de despesa (raw)
--   'elemento'     → elemento de despesa
--   ''             → dimensão não utilizada (retorna NULL)
-- ================================================================

CREATE OR REPLACE FUNCTION public.lc131_pivot_multi(
  p_dim1          text    DEFAULT 'municipio',
  p_dim2          text    DEFAULT 'fonte_simpl',
  p_dim3          text    DEFAULT 'grupo_simpl',
  p_dim4          text    DEFAULT 'rotulo',
  p_ano           int     DEFAULT NULL,
  p_drs           text    DEFAULT NULL,
  p_rras          text    DEFAULT NULL,
  p_regiao_ad     text    DEFAULT NULL,
  p_regiao_sa     text    DEFAULT NULL,
  p_municipio     text    DEFAULT NULL,
  p_grupo_despesa text    DEFAULT NULL,
  p_tipo_despesa  text    DEFAULT NULL,
  p_rotulo        text    DEFAULT NULL,
  p_elemento      text    DEFAULT NULL,
  p_uo            text    DEFAULT NULL,
  p_favorecido    text    DEFAULT NULL,
  p_codigo_ug     text    DEFAULT NULL,
  p_fonte_recurso text    DEFAULT NULL
)
RETURNS TABLE(
  d1             text,
  d2             text,
  d3             text,
  d4             text,
  ano_referencia int,
  empenhado      numeric,
  liquidado      numeric,
  pago_total     numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET statement_timeout = '180s'
AS $$
DECLARE
  -- Allowlist of accepted dimension names (prevents SQL injection)
  allowed_dims CONSTANT text[] := ARRAY[
    'municipio','drs','rras','regiao_ad','regiao_sa',
    'fonte_simpl','grupo_simpl','tipo_despesa','rotulo',
    'grupo_despesa','elemento',''
  ];

  -- Pre-built SQL CASE expressions for computed dimensions
  fonte_case CONSTANT text :=
    $e$CASE
      WHEN lower(codigo_nome_fonte_recurso) LIKE '%federal%'
        OR lower(codigo_nome_fonte_recurso) LIKE '%transfer%'
        OR lower(codigo_nome_fonte_recurso) LIKE '%fundo nac%'
        OR lower(codigo_nome_fonte_recurso) LIKE '%163150%'
        OR lower(codigo_nome_fonte_recurso) LIKE '% sus%'
        OR lower(codigo_nome_fonte_recurso) LIKE 'sus%'
        OR lower(codigo_nome_fonte_recurso) LIKE '%uniao%'
        OR lower(codigo_nome_fonte_recurso) LIKE '%unia%'
      THEN 'FEDERAL'
      ELSE 'ESTADUAL'
    END$e$;

  grupo_case CONSTANT text :=
    $e$CASE
      WHEN codigo_nome_grupo LIKE '3%' THEN 'CUSTEIO'
      WHEN codigo_nome_grupo LIKE '4%' THEN 'INVESTIMENTO'
      WHEN codigo_nome_grupo LIKE '1%' THEN 'PESSOAL'
      WHEN codigo_nome_grupo LIKE '5%' THEN 'INV. FINANCEIRAS'
      ELSE 'OUTROS'
    END$e$;

  -- Dimension SQL expression helpers
  v_dim1  text;
  v_dim2  text;
  v_dim3  text;
  v_dim4  text;
  v_where text := '1=1';
  v_sql   text;

  -- Federal-source condition (reused in fonte_recurso filter)
  federal_cond CONSTANT text :=
    $c$(lower(codigo_nome_fonte_recurso) LIKE '%federal%'
    OR lower(codigo_nome_fonte_recurso) LIKE '%transfer%'
    OR lower(codigo_nome_fonte_recurso) LIKE '%fundo nac%'
    OR lower(codigo_nome_fonte_recurso) LIKE '%163150%'
    OR lower(codigo_nome_fonte_recurso) LIKE '% sus%'
    OR lower(codigo_nome_fonte_recurso) LIKE 'sus%'
    OR lower(codigo_nome_fonte_recurso) LIKE '%uniao%'
    OR lower(codigo_nome_fonte_recurso) LIKE '%unia%')$c$;

BEGIN
  -- ── Validate dimension parameters (allowlist) ──────────────────────────
  IF NOT (p_dim1 = ANY(allowed_dims)) THEN
    RAISE EXCEPTION 'lc131_pivot_multi: dimensão inválida para p_dim1: %', p_dim1;
  END IF;
  IF NOT (p_dim2 = ANY(allowed_dims)) THEN
    RAISE EXCEPTION 'lc131_pivot_multi: dimensão inválida para p_dim2: %', p_dim2;
  END IF;
  IF NOT (p_dim3 = ANY(allowed_dims)) THEN
    RAISE EXCEPTION 'lc131_pivot_multi: dimensão inválida para p_dim3: %', p_dim3;
  END IF;
  IF NOT (p_dim4 = ANY(allowed_dims)) THEN
    RAISE EXCEPTION 'lc131_pivot_multi: dimensão inválida para p_dim4: %', p_dim4;
  END IF;

  -- ── Map dimension names to SQL column expressions ───────────────────────
  v_dim1 := CASE p_dim1
    WHEN 'municipio'     THEN 'COALESCE(municipio, ''(Vazio)'')'
    WHEN 'drs'           THEN 'COALESCE(drs, ''(Vazio)'')'
    WHEN 'rras'          THEN 'COALESCE(rras, ''(Vazio)'')'
    WHEN 'regiao_ad'     THEN 'COALESCE(regiao_ad, ''(Vazio)'')'
    WHEN 'regiao_sa'     THEN 'COALESCE(regiao_sa, ''(Vazio)'')'
    WHEN 'fonte_simpl'   THEN fonte_case
    WHEN 'grupo_simpl'   THEN grupo_case
    WHEN 'tipo_despesa'  THEN 'COALESCE(tipo_despesa, ''(Vazio)'')'
    WHEN 'rotulo'        THEN 'COALESCE(rotulo, ''(Vazio)'')'
    WHEN 'grupo_despesa' THEN 'COALESCE(codigo_nome_grupo, ''(Vazio)'')'
    WHEN 'elemento'      THEN 'COALESCE(codigo_nome_elemento, ''(Vazio)'')'
    ELSE 'NULL'
  END;

  v_dim2 := CASE p_dim2
    WHEN 'municipio'     THEN 'COALESCE(municipio, ''(Vazio)'')'
    WHEN 'drs'           THEN 'COALESCE(drs, ''(Vazio)'')'
    WHEN 'rras'          THEN 'COALESCE(rras, ''(Vazio)'')'
    WHEN 'regiao_ad'     THEN 'COALESCE(regiao_ad, ''(Vazio)'')'
    WHEN 'regiao_sa'     THEN 'COALESCE(regiao_sa, ''(Vazio)'')'
    WHEN 'fonte_simpl'   THEN fonte_case
    WHEN 'grupo_simpl'   THEN grupo_case
    WHEN 'tipo_despesa'  THEN 'COALESCE(tipo_despesa, ''(Vazio)'')'
    WHEN 'rotulo'        THEN 'COALESCE(rotulo, ''(Vazio)'')'
    WHEN 'grupo_despesa' THEN 'COALESCE(codigo_nome_grupo, ''(Vazio)'')'
    WHEN 'elemento'      THEN 'COALESCE(codigo_nome_elemento, ''(Vazio)'')'
    ELSE 'NULL'
  END;

  v_dim3 := CASE p_dim3
    WHEN 'municipio'     THEN 'COALESCE(municipio, ''(Vazio)'')'
    WHEN 'drs'           THEN 'COALESCE(drs, ''(Vazio)'')'
    WHEN 'rras'          THEN 'COALESCE(rras, ''(Vazio)'')'
    WHEN 'regiao_ad'     THEN 'COALESCE(regiao_ad, ''(Vazio)'')'
    WHEN 'regiao_sa'     THEN 'COALESCE(regiao_sa, ''(Vazio)'')'
    WHEN 'fonte_simpl'   THEN fonte_case
    WHEN 'grupo_simpl'   THEN grupo_case
    WHEN 'tipo_despesa'  THEN 'COALESCE(tipo_despesa, ''(Vazio)'')'
    WHEN 'rotulo'        THEN 'COALESCE(rotulo, ''(Vazio)'')'
    WHEN 'grupo_despesa' THEN 'COALESCE(codigo_nome_grupo, ''(Vazio)'')'
    WHEN 'elemento'      THEN 'COALESCE(codigo_nome_elemento, ''(Vazio)'')'
    ELSE 'NULL'
  END;

  v_dim4 := CASE p_dim4
    WHEN 'municipio'     THEN 'COALESCE(municipio, ''(Vazio)'')'
    WHEN 'drs'           THEN 'COALESCE(drs, ''(Vazio)'')'
    WHEN 'rras'          THEN 'COALESCE(rras, ''(Vazio)'')'
    WHEN 'regiao_ad'     THEN 'COALESCE(regiao_ad, ''(Vazio)'')'
    WHEN 'regiao_sa'     THEN 'COALESCE(regiao_sa, ''(Vazio)'')'
    WHEN 'fonte_simpl'   THEN fonte_case
    WHEN 'grupo_simpl'   THEN grupo_case
    WHEN 'tipo_despesa'  THEN 'COALESCE(tipo_despesa, ''(Vazio)'')'
    WHEN 'rotulo'        THEN 'COALESCE(rotulo, ''(Vazio)'')'
    WHEN 'grupo_despesa' THEN 'COALESCE(codigo_nome_grupo, ''(Vazio)'')'
    WHEN 'elemento'      THEN 'COALESCE(codigo_nome_elemento, ''(Vazio)'')'
    ELSE 'NULL'
  END;

  -- ── Build WHERE clause (all values quoted safely via %L) ────────────────
  IF p_ano IS NOT NULL THEN
    v_where := v_where || format(' AND ano_referencia = %s', p_ano);
  END IF;
  IF p_drs IS NOT NULL AND p_drs <> '' THEN
    v_where := v_where || format(' AND drs = ANY(string_to_array(%L, ''|''))', p_drs);
  END IF;
  IF p_rras IS NOT NULL AND p_rras <> '' THEN
    v_where := v_where || format(' AND rras = ANY(string_to_array(%L, ''|''))', p_rras);
  END IF;
  IF p_regiao_ad IS NOT NULL AND p_regiao_ad <> '' THEN
    v_where := v_where || format(' AND regiao_ad = ANY(string_to_array(%L, ''|''))', p_regiao_ad);
  END IF;
  IF p_regiao_sa IS NOT NULL AND p_regiao_sa <> '' THEN
    v_where := v_where || format(' AND regiao_sa = ANY(string_to_array(%L, ''|''))', p_regiao_sa);
  END IF;
  IF p_municipio IS NOT NULL AND p_municipio <> '' THEN
    v_where := v_where || format(' AND municipio = ANY(string_to_array(%L, ''|''))', p_municipio);
  END IF;
  IF p_grupo_despesa IS NOT NULL AND p_grupo_despesa <> '' THEN
    v_where := v_where || format(' AND codigo_nome_grupo = ANY(string_to_array(%L, ''|''))', p_grupo_despesa);
  END IF;
  IF p_tipo_despesa IS NOT NULL AND p_tipo_despesa <> '' THEN
    v_where := v_where || format(' AND tipo_despesa = ANY(string_to_array(%L, ''|''))', p_tipo_despesa);
  END IF;
  IF p_rotulo IS NOT NULL AND p_rotulo <> '' THEN
    v_where := v_where || format(' AND rotulo = ANY(string_to_array(%L, ''|''))', p_rotulo);
  END IF;
  IF p_elemento IS NOT NULL AND p_elemento <> '' THEN
    v_where := v_where || format(' AND codigo_nome_elemento = ANY(string_to_array(%L, ''|''))', p_elemento);
  END IF;
  IF p_uo IS NOT NULL AND p_uo <> '' THEN
    v_where := v_where || format(' AND codigo_nome_uo = ANY(string_to_array(%L, ''|''))', p_uo);
  END IF;
  IF p_favorecido IS NOT NULL AND p_favorecido <> '' THEN
    v_where := v_where || format(' AND codigo_nome_favorecido = ANY(string_to_array(%L, ''|''))', p_favorecido);
  END IF;
  IF p_codigo_ug IS NOT NULL AND p_codigo_ug <> '' THEN
    v_where := v_where || format(' AND codigo_ug = ANY(string_to_array(%L, ''|''))', p_codigo_ug);
  END IF;

  -- fonte_recurso filter: accepts ESTADUAL, FEDERAL, or raw value
  IF p_fonte_recurso IS NOT NULL AND p_fonte_recurso <> '' THEN
    IF p_fonte_recurso = 'FEDERAL' THEN
      v_where := v_where || ' AND ' || federal_cond;
    ELSIF p_fonte_recurso = 'ESTADUAL' THEN
      v_where := v_where || ' AND NOT ' || federal_cond;
    ELSIF p_fonte_recurso NOT LIKE '%FEDERAL%' OR p_fonte_recurso NOT LIKE '%ESTADUAL%' THEN
      -- Raw font name filter (pipe-separated list)
      v_where := v_where || format(
        ' AND codigo_nome_fonte_recurso = ANY(string_to_array(%L, ''|''))', p_fonte_recurso
      );
    END IF;
    -- If both ESTADUAL and FEDERAL are in the string, no fonte filter applies (show all)
  END IF;

  -- ── Assemble and execute dynamic SQL ────────────────────────────────────
  v_sql := format(
    $sql$
    WITH raw AS (
      SELECT
        %s AS d1,
        %s AS d2,
        %s AS d3,
        %s AS d4,
        ano_referencia,
        COALESCE(empenhado, 0)                                    AS v_emp,
        COALESCE(liquidado, 0)                                    AS v_liq,
        COALESCE(pago, 0) + COALESCE(pago_anos_anteriores, 0)    AS v_pago
      FROM public.lc131_despesas
      WHERE %s
      LIMIT 500000
    )
    SELECT
      d1,
      d2,
      d3,
      d4,
      ano_referencia,
      SUM(v_emp)::numeric  AS empenhado,
      SUM(v_liq)::numeric  AS liquidado,
      SUM(v_pago)::numeric AS pago_total
    FROM raw
    GROUP BY d1, d2, d3, d4, ano_referencia
    ORDER BY
      d1 NULLS LAST,
      d2 NULLS LAST,
      d3 NULLS LAST,
      d4 NULLS LAST,
      ano_referencia
    LIMIT 100000
    $sql$,
    v_dim1, v_dim2, v_dim3, v_dim4,
    v_where
  );

  RETURN QUERY EXECUTE v_sql;
END;
$$;

-- ── Permissions ─────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.lc131_pivot_multi(
  text, text, text, text,
  int,
  text, text, text, text, text, text, text, text, text, text, text, text, text
) TO service_role;

GRANT EXECUTE ON FUNCTION public.lc131_pivot_multi(
  text, text, text, text,
  int,
  text, text, text, text, text, text, text, text, text, text, text, text, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.lc131_pivot_multi(
  text, text, text, text,
  int,
  text, text, text, text, text, text, text, text, text, text, text, text, text
) TO anon;
