-- =======================================================================
-- MIGRAÇÃO: Substituir tab_drs + tab_rras por tab_municipios
-- Fonte oficial: DRS-REGIÃOADMINISTRATIVA-RRAS-RegiãodeSaúde-CódIBGE-MUNICÍPIO.xlsx
--
-- EXECUTE TUDO NO SUPABASE SQL EDITOR (uma vez)
-- =======================================================================

SET statement_timeout = 0;

-- ====================================================================
-- PASSO 1: Criar nova tabela tab_municipios
--          Fonte única de verdade para DRS, RRAS, Região Administrativa,
--          Região de Saúde, IBGE e Município de todo SP
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.tab_municipios (
  id            SERIAL PRIMARY KEY,
  municipio     TEXT   NOT NULL,   -- chave normalizada: MAIÚSCULAS sem acentos (ex: SAO PAULO)
  municipio_orig TEXT,             -- nome original com acentos (ex: São Paulo)
  drs           TEXT,              -- ex: "DRS I - Grande São Paulo"
  regiao_ad     TEXT,              -- ex: "SÃO PAULO"
  rras          TEXT,              -- ex: "RRAS 06"
  regiao_sa     TEXT,              -- ex: "Sao Paulo"
  cod_ibge      TEXT               -- ex: "355030"
);

-- Índice único na chave normalizada
CREATE UNIQUE INDEX IF NOT EXISTS idx_tab_municipios_municipio
  ON public.tab_municipios (municipio);

-- Acesso público de leitura
GRANT SELECT ON public.tab_municipios TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tab_municipios TO service_role;

-- ====================================================================
-- PASSO 2: Recriar refresh_dashboard_batch usando tab_municipios
--          (única fonte, substitui tab_drs + tab_rras)
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
    LIMIT p_batch_size
  ),
  enriched AS (
    SELECT
      lc.id,
      -- Prioridade 1: tab_municipios via nome_municipio
      -- Prioridade 2: tab_municipios via campo municipio
      -- Prioridade 3: bd_ref via codigo_projeto_atividade
      -- Prioridade 4: bd_ref via codigo_ug
      -- Prioridade 5: bd_ref via numero extraído de codigo_nome_ug
      NULLIF(TRIM(COALESCE(
        tm1.drs, tm2.drs, rb1.drs, rb2.drs, rb3.drs
      )), '') AS e_drs,
      NULLIF(TRIM(COALESCE(
        tm1.rras, tm2.rras
      )), '') AS e_rras,
      COALESCE(tm1.regiao_ad, tm2.regiao_ad, rb1.regiao_ad, rb2.regiao_ad, rb3.regiao_ad) AS e_regiao_ad,
      COALESCE(tm1.regiao_sa, tm2.regiao_sa, rb1.regiao_sa, rb2.regiao_sa, rb3.regiao_sa) AS e_regiao_sa,
      COALESCE(tm1.cod_ibge,  tm2.cod_ibge,  rb1.cod_ibge,  rb2.cod_ibge,  rb3.cod_ibge)  AS e_cod_ibge,
      COALESCE(lc.nome_municipio, tm1.municipio_orig, tm2.municipio_orig, rb1.municipio, rb2.municipio, rb3.municipio) AS e_municipio,
      COALESCE(rb1.unidade,  rb2.unidade,  rb3.unidade)  AS e_unidade,
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
    -- tab_municipios via nome_municipio (principal)
    LEFT JOIN tab_municipios tm1 ON tm1.municipio = norm_munic(lc.nome_municipio)
    -- tab_municipios via campo municipio (fallback)
    LEFT JOIN tab_municipios tm2 ON tm2.municipio = norm_munic(lc.municipio)
    -- bd_ref via codigo_projeto_atividade
    LEFT JOIN bd_ref rb1 ON rb1.codigo = LPAD(lc.codigo_projeto_atividade::text, 6, '0')
    -- bd_ref via codigo_ug
    LEFT JOIN bd_ref rb2 ON rb2.codigo = LPAD(lc.codigo_ug::text, 6, '0')
    -- bd_ref via numero em codigo_nome_ug (ex: "090196 - COORD...")
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
-- PASSO 3: Recriar refresh_dashboard (full batch loop) com tab_municipios
-- ====================================================================

DROP FUNCTION IF EXISTS public.refresh_dashboard();

CREATE OR REPLACE FUNCTION public.refresh_dashboard()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET statement_timeout = 0
AS $$
DECLARE
  batch_size    int := 10000;
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


-- ====================================================================
-- PASSO 4: Manter tab_drs e tab_rras como VIEWS das novas colunas
--          (retrocompatibilidade com scripts antigos)
--          Serão removidas em versão futura
-- ====================================================================

-- Não dropar ainda — manter como aliases para não quebrar scripts existentes
-- DROP TABLE IF EXISTS public.tab_drs;
-- DROP TABLE IF EXISTS public.tab_rras;

-- ====================================================================
-- PASSO 5: Verificação
-- ====================================================================
SELECT COUNT(*) AS tab_municipios_count FROM public.tab_municipios;
SELECT municipio, drs, regiao_ad, rras, regiao_sa, cod_ibge
FROM public.tab_municipios
ORDER BY municipio
LIMIT 10;
