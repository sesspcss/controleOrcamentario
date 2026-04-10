-- ================================================================
-- FIX COMPLETO: Matar lock travado + Re-enriquecer TODOS os dados
--
-- Execute TUDO de uma vez no SQL Editor do Supabase
-- ================================================================


-- ================================================================
-- PASSO 1: Matar TODAS as transações travadas em lc131_despesas
-- ================================================================

-- Lista transações ativas (para consulta)
SELECT pid, state, query_start, now() - query_start AS duration,
       left(query, 100) AS query_preview
FROM pg_stat_activity
WHERE state != 'idle'
  AND query ILIKE '%lc131%'
  OR query ILIKE '%refresh_dashboard%';

-- Termina forçadamente TODAS as transações que travam a tabela
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE pid != pg_backend_pid()
  AND (query ILIKE '%refresh_dashboard%'
    OR query ILIKE '%lc131_despesas%')
  AND state != 'idle';


-- ================================================================
-- PASSO 2: Recriar a função refresh_dashboard_batch MELHORADA
--          - Sem lock timeout (usa 300s)
--          - bd_ref.grupo_despesa está NULL, então preenche a partir
--            de codigo_nome_grupo
--          - rras do bd_ref é só número ("6"), tab_rras tem "RRAS 01"
-- ================================================================

DROP FUNCTION IF EXISTS public.refresh_dashboard_batch(integer);

CREATE OR REPLACE FUNCTION public.refresh_dashboard_batch(p_batch_size integer DEFAULT 5000)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET statement_timeout = 300000
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
      -- DRS: tab_drs primeiro, depois bd_ref
      NULLIF(TRIM(COALESCE(td.drs, td2.drs, rb1.drs,  rb2.drs,  rb3.drs)),  '') AS e_drs,
      -- RRAS: tab_rras primeiro (tem "RRAS 01"), depois bd_ref (tem "6")
      NULLIF(TRIM(COALESCE(tr.rras, tr2.rras, rb1.rras, rb2.rras, rb3.rras)), '') AS e_rras,
      COALESCE(rb1.regiao_ad,     rb2.regiao_ad,     rb3.regiao_ad)     AS e_regiao_ad,
      COALESCE(rb1.regiao_sa,     rb2.regiao_sa,     rb3.regiao_sa)     AS e_regiao_sa,
      COALESCE(rb1.cod_ibge,      rb2.cod_ibge,      rb3.cod_ibge)      AS e_cod_ibge,
      COALESCE(lc.nome_municipio, rb1.municipio, rb2.municipio, rb3.municipio) AS e_municipio,
      COALESCE(rb1.unidade,       rb2.unidade,       rb3.unidade)       AS e_unidade,
      COALESCE(rb1.fonte_recurso, rb2.fonte_recurso, rb3.fonte_recurso) AS e_fonte_recurso,
      -- grupo_despesa: bd_ref está NULL, então usa codigo_nome_grupo como fallback
      COALESCE(rb1.grupo_despesa, rb2.grupo_despesa, rb3.grupo_despesa,
        lc.codigo_nome_grupo
      ) AS e_grupo_despesa,
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


-- ================================================================
-- PASSO 3: Recriar refresh_dashboard (versão completa)
-- ================================================================

DROP FUNCTION IF EXISTS public.refresh_dashboard();

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
-- PASSO 4: Reload PostgREST schema cache
-- ================================================================

NOTIFY pgrst, 'reload schema';
