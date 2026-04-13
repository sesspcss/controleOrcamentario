-- =======================================================================
-- FIX FORÇADO: Corrigir RRAS, DRS e Regiões em TODAS as linhas
--              + Remover tabelas obsoletas tab_drs e tab_rras
--
-- PROBLEMA: Linhas com RRAS='6','9' (números puros do bd_ref antigo)
--           não eram atualizadas porque fix-empty-cols.sql só tocava
--           linhas VAZIAS. Agora atualizamos TODAS por município.
--
-- Execute no Supabase SQL Editor
-- =======================================================================

SET statement_timeout = 0;

-- ====================================================================
-- PASSO 1: Forçar atualização de DRS/RRAS/Regiões/IBGE em TODAS as
--          linhas que têm município reconhecido em tab_municipios
--          (sobrescreve valores incorretos como '6', '9', etc.)
-- ====================================================================
UPDATE public.lc131_despesas tgt
SET
  drs       = tm.drs,
  rras      = tm.rras,
  regiao_ad = tm.regiao_ad,
  regiao_sa = tm.regiao_sa,
  cod_ibge  = tm.cod_ibge
FROM public.tab_municipios tm
WHERE tm.municipio = norm_munic(tgt.nome_municipio)
  AND tm.drs IS NOT NULL;

-- Contagem após atualização por nome_municipio
DO $$
DECLARE n bigint;
BEGIN
  SELECT COUNT(*) INTO n FROM public.lc131_despesas WHERE drs IS NOT NULL AND drs <> '';
  RAISE NOTICE 'Depois do UPDATE por nome_municipio: % linhas com DRS preenchido', n;
END $$;

-- ====================================================================
-- PASSO 2: Fallback — linhas que não bateram por nome_municipio,
--          tentar pelo campo municipio
-- ====================================================================
UPDATE public.lc131_despesas tgt
SET
  drs       = tm.drs,
  rras      = tm.rras,
  regiao_ad = tm.regiao_ad,
  regiao_sa = tm.regiao_sa,
  cod_ibge  = tm.cod_ibge
FROM public.tab_municipios tm
WHERE tm.municipio = norm_munic(tgt.municipio)
  AND tm.drs IS NOT NULL
  AND (COALESCE(TRIM(tgt.drs), '') = ''   -- sem DRS ainda
    OR tgt.rras ~ '^[0-9]+$');             -- RRAS ainda em formato numérico puro

-- ====================================================================
-- PASSO 3: Normalizar quaisquer RRAS restantes em formato numérico puro
--          ex: '6' → 'RRAS 06',  '15' → 'RRAS 15'
-- ====================================================================
UPDATE public.lc131_despesas
SET rras = 'RRAS ' || LPAD(rras, 2, '0')
WHERE rras ~ '^[0-9]{1,2}$';

-- Verificação rápida
DO $$
DECLARE n bigint;
BEGIN
  SELECT COUNT(*) INTO n FROM public.lc131_despesas WHERE rras ~ '^[0-9]+$';
  IF n > 0 THEN
    RAISE WARNING '% linhas ainda com RRAS em formato numérico puro!', n;
  ELSE
    RAISE NOTICE 'RRAS: sem valores em formato numérico puro. OK!';
  END IF;
END $$;

-- ====================================================================
-- PASSO 4: Recriar refresh_dashboard_batch — candidatos incluem agora
--          RRAS em formato numérico puro (catch residual)
-- ====================================================================
DROP FUNCTION IF EXISTS public.refresh_dashboard_batch(integer);

CREATE OR REPLACE FUNCTION public.refresh_dashboard_batch(
  p_batch_size integer DEFAULT 5000
)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET statement_timeout = 300000
AS $$
DECLARE rows_affected bigint;
BEGIN
  WITH candidates AS (
    SELECT id FROM lc131_despesas
    WHERE COALESCE(TRIM(drs), '')      = ''
       OR COALESCE(TRIM(rras), '')     = ''
       OR COALESCE(TRIM(regiao_ad), '') = ''
       OR COALESCE(TRIM(rotulo), '')   = ''
       OR rras ~ '^[0-9]+$'           -- RRAS em formato numérico puro (legado)
    LIMIT p_batch_size
  ),
  enriched AS (
    SELECT
      lc.id,
      NULLIF(TRIM(COALESCE(tm1.drs,  tm2.drs,  rb1.drs,  rb2.drs,  rb3.drs )), '') AS e_drs,
      NULLIF(TRIM(COALESCE(tm1.rras, tm2.rras                                )), '') AS e_rras,
      COALESCE(tm1.regiao_ad, tm2.regiao_ad, rb1.regiao_ad, rb2.regiao_ad, rb3.regiao_ad) AS e_regiao_ad,
      COALESCE(tm1.regiao_sa, tm2.regiao_sa, rb1.regiao_sa, rb2.regiao_sa, rb3.regiao_sa) AS e_regiao_sa,
      COALESCE(tm1.cod_ibge,  tm2.cod_ibge,  rb1.cod_ibge,  rb2.cod_ibge,  rb3.cod_ibge)  AS e_cod_ibge,
      COALESCE(lc.nome_municipio, tm1.municipio_orig, tm2.municipio_orig, rb1.municipio, rb2.municipio, rb3.municipio) AS e_municipio,
      COALESCE(rb1.unidade,       rb2.unidade,       rb3.unidade)       AS e_unidade,
      COALESCE(rb1.fonte_recurso, rb2.fonte_recurso, rb3.fonte_recurso) AS e_fonte,
      COALESCE(rb1.grupo_despesa, rb2.grupo_despesa, rb3.grupo_despesa) AS e_grupo,
      COALESCE(rb1.tipo_despesa,  rb2.tipo_despesa,  rb3.tipo_despesa)  AS e_tipo,
      COALESCE(rb1.rotulo, rb2.rotulo, rb3.rotulo,
        CASE
          WHEN lc.codigo_nome_projeto_atividade ILIKE '%ambulat%'
            OR lc.codigo_nome_projeto_atividade ILIKE '%hospitalar%'
            OR lc.codigo_nome_projeto_atividade ILIKE '%rede%propria%'
            OR lc.codigo_nome_projeto_atividade ILIKE '%bata cinza%'
            OR lc.codigo_nome_projeto_atividade ILIKE '%UNICAMP%'       THEN 'Assistência Hospitalar'
          WHEN lc.codigo_nome_projeto_atividade ILIKE '%farmac%'
            OR lc.codigo_nome_projeto_atividade ILIKE '%medicamento%'   THEN 'Assistência Farmacêutica'
          WHEN lc.codigo_nome_projeto_atividade ILIKE '%vigil%'         THEN 'Vigilância em Saúde'
          WHEN lc.codigo_nome_projeto_atividade ILIKE '%aparelh%'
            OR lc.codigo_nome_projeto_atividade ILIKE '%equip%'
            OR lc.codigo_nome_projeto_atividade ILIKE '%reform%'
            OR lc.codigo_nome_projeto_atividade ILIKE '%construc%'      THEN 'Infraestrutura'
          WHEN lc.codigo_nome_projeto_atividade ILIKE '%admin%'
            OR lc.codigo_nome_projeto_atividade ILIKE '%conselho%'      THEN 'Gestão e Administração'
          WHEN lc.codigo_nome_projeto_atividade ILIKE '%emenda%'        THEN 'Emendas Parlamentares'
          WHEN lc.codigo_nome_projeto_atividade ILIKE '%judicial%'
            OR lc.codigo_nome_projeto_atividade ILIKE '%demanda%jud%'   THEN 'Demandas Judiciais'
          WHEN lc.codigo_nome_projeto_atividade ILIKE '%subvenc%'
            OR lc.codigo_nome_projeto_atividade ILIKE '%filantrop%'     THEN 'Entidades Filantrópicas'
          WHEN lc.codigo_nome_projeto_atividade ILIKE '%resid%med%'
            OR lc.codigo_nome_projeto_atividade ILIKE '%capacit%'       THEN 'Formação e Capacitação'
          WHEN lc.codigo_nome_projeto_atividade ILIKE '%descentraliz%'
            OR lc.codigo_nome_projeto_atividade ILIKE '%prisional%'     THEN 'Atenção Descentralizada'
          WHEN lc.codigo_nome_projeto_atividade ILIKE '%publicidade%'   THEN 'Comunicação'
          ELSE 'Outros'
        END
      ) AS e_rotulo
    FROM lc131_despesas lc
    INNER JOIN candidates c ON c.id = lc.id
    LEFT JOIN tab_municipios tm1 ON tm1.municipio = norm_munic(lc.nome_municipio)
    LEFT JOIN tab_municipios tm2 ON tm2.municipio = norm_munic(lc.municipio)
    LEFT JOIN bd_ref rb1 ON rb1.codigo = LPAD(lc.codigo_projeto_atividade::text, 6, '0')
    LEFT JOIN bd_ref rb2 ON rb2.codigo = LPAD(lc.codigo_ug::text, 6, '0')
    LEFT JOIN bd_ref rb3 ON rb3.codigo = LPAD(
        NULLIF(regexp_replace(split_part(lc.codigo_nome_ug::text, ' ', 1), '[^0-9]', '', 'g'), ''),
        6, '0')
  )
  UPDATE lc131_despesas tgt
  SET
    drs           = COALESCE(enriched.e_drs,       NULLIF(TRIM(tgt.drs), '')),
    rras          = COALESCE(enriched.e_rras,       NULLIF(TRIM(tgt.rras), '')),
    regiao_ad     = COALESCE(enriched.e_regiao_ad,  NULLIF(TRIM(tgt.regiao_ad), '')),
    regiao_sa     = COALESCE(enriched.e_regiao_sa,  NULLIF(TRIM(tgt.regiao_sa), '')),
    cod_ibge      = COALESCE(enriched.e_cod_ibge,   NULLIF(TRIM(tgt.cod_ibge), '')),
    municipio     = COALESCE(enriched.e_municipio,  NULLIF(TRIM(tgt.municipio), '')),
    unidade       = COALESCE(enriched.e_unidade,    NULLIF(TRIM(tgt.unidade), '')),
    fonte_recurso = COALESCE(enriched.e_fonte,      NULLIF(TRIM(tgt.fonte_recurso), '')),
    grupo_despesa = COALESCE(enriched.e_grupo,      NULLIF(TRIM(tgt.grupo_despesa), ''), tgt.codigo_nome_grupo),
    tipo_despesa  = COALESCE(enriched.e_tipo,       NULLIF(TRIM(tgt.tipo_despesa), '')),
    rotulo        = COALESCE(enriched.e_rotulo,     NULLIF(TRIM(tgt.rotulo), '')),
    pago_total    = COALESCE(tgt.pago, 0) + COALESCE(tgt.pago_anos_anteriores, 0)
  FROM enriched
  WHERE tgt.id = enriched.id;

  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_dashboard_batch(integer) TO anon, authenticated;

-- ====================================================================
-- PASSO 5: Remover tabelas obsoletas tab_drs e tab_rras
-- ====================================================================
DROP TABLE IF EXISTS public.tab_drs  CASCADE;
DROP TABLE IF EXISTS public.tab_rras CASCADE;

-- ====================================================================
-- PASSO 6: Verificação final por ano
-- ====================================================================
SELECT
  ano_referencia,
  COUNT(*)          AS total,
  COUNT(drs)        AS com_drs,
  COUNT(rras)       AS com_rras,
  COUNT(regiao_ad)  AS com_regiao_ad,
  ROUND(COUNT(drs)::numeric/COUNT(*)*100, 1) AS pct_drs
FROM public.lc131_despesas
GROUP BY ano_referencia ORDER BY ano_referencia;

-- Verificar valores distintos de RRAS para confirmar formato correto
SELECT DISTINCT rras
FROM public.lc131_despesas
WHERE rras IS NOT NULL AND rras <> ''
ORDER BY rras;

NOTIFY pgrst, 'reload schema';
