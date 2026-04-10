-- =======================================================================
-- FIX: Colunas vazias em lc131_despesas (DRS, RRAS, REGIÃO, etc.)
-- Fonte de referência oficial: tab_municipios (criada pelo migrate-to-tab-municipios.sql)
--
-- PRÉ-REQUISITO: Execute ANTES:
--   1. scripts/migrate-to-tab-municipios.sql  (cria tab_municipios + atualiza funções)
--   2. node scripts/import-tab-municipios.mjs (popula tab_municipios do Excel oficial)
--
-- Este script apenas re-enriquece os dados usando a nova tabela.
-- =======================================================================

SET statement_timeout = 0;

-- ====================================================================
-- PASSO 1: Verificar contagem em tab_municipios
--          Se for 0, execute import-tab-municipios.mjs antes!
-- ====================================================================
DO $$
DECLARE cnt integer;
BEGIN
  SELECT COUNT(*) INTO cnt FROM public.tab_municipios;
  IF cnt = 0 THEN
    RAISE EXCEPTION 'tab_municipios está vazia! Execute: node scripts/import-tab-municipios.mjs "C:\Users\afpereira\Downloads\LC31\DRS-REGIÃOADMINISTRATIVA-RRAS-RegiãodeSaúde-CódIBGE-MUNICÍPIO.xlsx"';
  END IF;
  RAISE NOTICE 'tab_municipios: % municípios carregados. OK!', cnt;
END $$;

-- ====================================================================
-- PASSO 2: Enriquecer TODAS as linhas com DRS/RRAS/Região vazio
--          usando tab_municipios (fonte oficial) + bd_ref (UGs)
-- ====================================================================
UPDATE public.lc131_despesas tgt
SET
  drs           = COALESCE(sub.e_drs,       NULLIF(TRIM(tgt.drs), '')),
  rras          = COALESCE(sub.e_rras,      NULLIF(TRIM(tgt.rras), '')),
  regiao_ad     = COALESCE(sub.e_regiao_ad, NULLIF(TRIM(tgt.regiao_ad), '')),
  regiao_sa     = COALESCE(sub.e_regiao_sa, NULLIF(TRIM(tgt.regiao_sa), '')),
  cod_ibge      = COALESCE(sub.e_cod_ibge,  NULLIF(TRIM(tgt.cod_ibge), '')),
  municipio     = COALESCE(sub.e_municipio, NULLIF(TRIM(tgt.municipio), '')),
  unidade       = COALESCE(sub.e_unidade,   NULLIF(TRIM(tgt.unidade), '')),
  fonte_recurso = COALESCE(sub.e_fonte,     NULLIF(TRIM(tgt.fonte_recurso), '')),
  grupo_despesa = COALESCE(sub.e_grupo,     NULLIF(TRIM(tgt.grupo_despesa), ''), tgt.codigo_nome_grupo),
  tipo_despesa  = COALESCE(sub.e_tipo,      NULLIF(TRIM(tgt.tipo_despesa), '')),
  rotulo        = COALESCE(sub.e_rotulo,    NULLIF(TRIM(tgt.rotulo), '')),
  pago_total    = COALESCE(tgt.pago, 0) + COALESCE(tgt.pago_anos_anteriores, 0)
FROM (
  SELECT
    lc.id,
    -- tab_municipios: fonte oficial para DRS, RRAS, Região Admin., Região Saúde, IBGE
    NULLIF(TRIM(COALESCE(tm1.drs,      tm2.drs,      rb1.drs,  rb2.drs,  rb3.drs )), '') AS e_drs,
    NULLIF(TRIM(COALESCE(tm1.rras,     tm2.rras                                   )), '') AS e_rras,
    COALESCE(tm1.regiao_ad, tm2.regiao_ad, rb1.regiao_ad, rb2.regiao_ad, rb3.regiao_ad)   AS e_regiao_ad,
    COALESCE(tm1.regiao_sa, tm2.regiao_sa, rb1.regiao_sa, rb2.regiao_sa, rb3.regiao_sa)   AS e_regiao_sa,
    COALESCE(tm1.cod_ibge,  tm2.cod_ibge,  rb1.cod_ibge,  rb2.cod_ibge,  rb3.cod_ibge)   AS e_cod_ibge,
    COALESCE(lc.nome_municipio, tm1.municipio_orig, tm2.municipio_orig, rb1.municipio, rb2.municipio, rb3.municipio) AS e_municipio,
    COALESCE(rb1.unidade,       rb2.unidade,       rb3.unidade)       AS e_unidade,
    COALESCE(rb1.fonte_recurso, rb2.fonte_recurso, rb3.fonte_recurso) AS e_fonte,
    COALESCE(rb1.grupo_despesa, rb2.grupo_despesa, rb3.grupo_despesa) AS e_grupo,
    COALESCE(rb1.tipo_despesa,  rb2.tipo_despesa,  rb3.tipo_despesa)  AS e_tipo,
    COALESCE(rb1.rotulo,        rb2.rotulo,        rb3.rotulo,
      CASE
        WHEN lc.codigo_nome_projeto_atividade ILIKE '%ambulat%'
          OR lc.codigo_nome_projeto_atividade ILIKE '%hospitalar%'
          OR lc.codigo_nome_projeto_atividade ILIKE '%rede%propria%'  THEN 'Assistência Hospitalar'
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
  FROM public.lc131_despesas lc
  -- tab_municipios via nome_municipio (principal — nome oficial com ou sem acentos)
  LEFT JOIN public.tab_municipios tm1 ON tm1.municipio = norm_munic(lc.nome_municipio)
  -- tab_municipios via campo municipio (fallback)
  LEFT JOIN public.tab_municipios tm2 ON tm2.municipio = norm_munic(lc.municipio)
  -- bd_ref por codigo_projeto_atividade (UGs da SES-SP)
  LEFT JOIN public.bd_ref   rb1  ON rb1.codigo = LPAD(lc.codigo_projeto_atividade::text, 6, '0')
  -- bd_ref por codigo_ug
  LEFT JOIN public.bd_ref   rb2  ON rb2.codigo = LPAD(lc.codigo_ug::text, 6, '0')
  -- bd_ref pelo número extraído de codigo_nome_ug (ex: "090196 - COORD...")
  LEFT JOIN public.bd_ref   rb3  ON rb3.codigo = LPAD(
      NULLIF(regexp_replace(split_part(lc.codigo_nome_ug::text, ' ', 1), '[^0-9]', '', 'g'), ''),
      6, '0')
  WHERE COALESCE(TRIM(lc.drs), '')      = ''
     OR COALESCE(TRIM(lc.rras), '')     = ''
     OR COALESCE(TRIM(lc.regiao_ad), '') = ''
) sub
WHERE tgt.id = sub.id;

-- ====================================================================
-- PASSO 3: Verificação final por ano
-- ====================================================================
SELECT
  ano_referencia,
  COUNT(*)          AS total,
  COUNT(drs)        AS com_drs,
  COUNT(rras)       AS com_rras,
  COUNT(regiao_ad)  AS com_regiao_ad,
  ROUND(COUNT(drs)::numeric/COUNT(*)*100,1) AS pct_drs
FROM public.lc131_despesas
GROUP BY ano_referencia ORDER BY ano_referencia;

NOTIFY pgrst, 'reload schema';
