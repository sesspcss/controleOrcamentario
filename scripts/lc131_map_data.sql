-- ───────────────────────────────────────────────────────────────
-- 5. lc131_map_data — dados agregados para o mapa interativo
--    Retorna KPIs + todos DRS + todos RRAS + todos municípios
--    Execute APÓS compact_functions_all.sql
-- ───────────────────────────────────────────────────────────────
SET statement_timeout = 0;

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

-- Teste rápido
SELECT lc131_map_data(2026) IS NOT NULL AS ok;
