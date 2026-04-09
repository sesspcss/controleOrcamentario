-- ================================================================
-- PARTE 4 de 4 — Funções lc131_detail + refresh_dashboard
-- Execute DEPOIS da Parte 3
-- ================================================================
SET statement_timeout = 0;

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


-- ── refresh_dashboard ──
CREATE OR REPLACE FUNCTION public.refresh_dashboard()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET statement_timeout = 0
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

-- Teste rápido
SELECT lc131_dashboard() IS NOT NULL AS dashboard_ok;
