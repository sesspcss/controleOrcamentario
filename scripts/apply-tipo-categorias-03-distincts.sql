SET statement_timeout = 0;

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
              WHEN tipo_despesa = 'TABELA SUS PAULISTA' THEN 'Tesouro'
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
    'distinct_drs',        (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT drs AS d FROM filtered WHERE drs IS NOT NULL AND drs<>'') x),
    'distinct_regiao_ad',  (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT regiao_ad AS d FROM filtered WHERE regiao_ad IS NOT NULL AND regiao_ad<>'') x),
    'distinct_rras',       (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT rras AS d FROM filtered WHERE rras IS NOT NULL AND rras<>'') x),
    'distinct_regiao_sa',  (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT regiao_sa AS d FROM filtered WHERE regiao_sa IS NOT NULL AND regiao_sa<>'') x),
    'distinct_municipio',  (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT municipio AS d FROM filtered WHERE municipio IS NOT NULL AND municipio<>'') x),
    'distinct_grupo',      (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT codigo_nome_grupo AS d FROM filtered WHERE codigo_nome_grupo IS NOT NULL AND codigo_nome_grupo<>'') x),
    'distinct_tipo',       (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT tipo_despesa AS d FROM filtered WHERE tipo_despesa IS NOT NULL AND tipo_despesa<>'') x),
    'distinct_rotulo',     (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT rotulo AS d FROM filtered WHERE rotulo IS NOT NULL AND rotulo<>'') x),
    'distinct_fonte',      (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT
                              CASE
                                WHEN tipo_despesa = 'TABELA SUS PAULISTA' THEN 'Tesouro'
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
    'distinct_codigo_ug',  (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT codigo_ug::text AS d FROM filtered WHERE codigo_ug IS NOT NULL) x),
    'distinct_uo',         (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT codigo_nome_uo AS d FROM filtered WHERE codigo_nome_uo IS NOT NULL AND codigo_nome_uo<>'') x),
    'distinct_elemento',   (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT codigo_nome_elemento AS d FROM filtered WHERE codigo_nome_elemento IS NOT NULL AND codigo_nome_elemento<>'') x),
    'distinct_favorecido', (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT codigo_nome_favorecido AS d FROM filtered WHERE codigo_nome_favorecido IS NOT NULL AND codigo_nome_favorecido<>'') x)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lc131_distincts(integer,text,text,text,text,text,text,text,text,text,text,text,text,text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';