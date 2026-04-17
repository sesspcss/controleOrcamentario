-- ================================================================
-- post-import-fn.sql — Função post_import_cleanup
-- Deploy UMA VEZ no Supabase SQL Editor.
-- Executada automaticamente após cada import via post-import.mjs.
--
-- O QUE FAZ:
--   1. Normaliza DRS (prefixo numérico → algarismo romano)
--   2. Popula DRS/RRAS nulos pelo valor mais frequente do município
--   3. Força reclassificação de NULL / SEM CLASSIFICAÇÃO → grupo fallback
--   4. Corrige fonte_recurso de TABELA SUS PAULISTA → Tesouro
--   5. Reclassifica TABELA SUS com elemento 334130 ou fonte 163150
--   6. Popula rotulo vazio (codigo_nome_projeto_atividade)
--   7. Retorna resumo em JSON
-- NOTA: bd_ref_tipo NÃO é apagado aqui — apague manualmente via cleanup-db.sql PARTE A
-- ================================================================

CREATE OR REPLACE FUNCTION public.post_import_cleanup(p_ano INT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r JSONB := '{}';
  n INT;
BEGIN

  -- ── 1. Normalizar DRS: prefixo numérico → algarismo romano ──────────────
  UPDATE public.lc131_despesas
  SET drs = CASE drs
    WHEN '01 Grande São Paulo'       THEN 'DRS I - Grande São Paulo'
    WHEN '02 Araçatuba'              THEN 'DRS II - Araçatuba'
    WHEN '03 Araraquara'             THEN 'DRS III - Araraquara'
    WHEN '04 Baixada Santista'       THEN 'DRS IV - Baixada Santista'
    WHEN '05 Barretos'               THEN 'DRS V - Barretos'
    WHEN '06 Bauru'                  THEN 'DRS VI - Bauru'
    WHEN '07 Campinas'               THEN 'DRS VII - Campinas'
    WHEN '08 Franca'                 THEN 'DRS VIII - Franca'
    WHEN '09 Marília'                THEN 'DRS IX - Marília'
    WHEN '10 Piracicaba'             THEN 'DRS X - Piracicaba'
    WHEN '11 Presidente Prudente'    THEN 'DRS XI - Presidente Prudente'
    WHEN '12 Registro'               THEN 'DRS XII - Registro'
    WHEN '13 Ribeirão Preto'         THEN 'DRS XIII - Ribeirão Preto'
    WHEN '14 São João da Boa Vista'  THEN 'DRS XIV - São João da Boa Vista'
    WHEN '15 São José do Rio Preto'  THEN 'DRS XV - São José do Rio Preto'
    WHEN '16 Sorocaba'               THEN 'DRS XVI - Sorocaba'
    WHEN '17 Taubaté'                THEN 'DRS XVII - Taubaté'
    ELSE drs
  END
  WHERE drs ~ E'^[0-9]{2} ';
  GET DIAGNOSTICS n = ROW_COUNT;
  r := r || jsonb_build_object('drs_normalized', n);

  -- ── 2. Popula DRS nulo com o valor mais frequente para o mesmo município ──
  WITH drs_map AS (
    SELECT municipio, drs
    FROM (
      SELECT municipio, drs, count(*) AS cnt,
             ROW_NUMBER() OVER (PARTITION BY municipio ORDER BY count(*) DESC) AS rn
      FROM public.lc131_despesas
      WHERE drs IS NOT NULL AND drs <> '' AND municipio IS NOT NULL
      GROUP BY municipio, drs
    ) t WHERE rn = 1
  )
  UPDATE public.lc131_despesas a
  SET drs = m.drs
  FROM drs_map m
  WHERE a.municipio = m.municipio
    AND (a.drs IS NULL OR a.drs = '');
  GET DIAGNOSTICS n = ROW_COUNT;
  r := r || jsonb_build_object('drs_filled', n);

  -- ── 3. Popula RRAS nulo da mesma forma ────────────────────────────────────
  WITH rras_map AS (
    SELECT municipio, rras
    FROM (
      SELECT municipio, rras, count(*) AS cnt,
             ROW_NUMBER() OVER (PARTITION BY municipio ORDER BY count(*) DESC) AS rn
      FROM public.lc131_despesas
      WHERE rras IS NOT NULL AND rras <> '' AND municipio IS NOT NULL
      GROUP BY municipio, rras
    ) t WHERE rn = 1
  )
  UPDATE public.lc131_despesas a
  SET rras = m.rras
  FROM rras_map m
  WHERE a.municipio = m.municipio
    AND (a.rras IS NULL OR a.rras = '');
  GET DIAGNOSTICS n = ROW_COUNT;
  r := r || jsonb_build_object('rras_filled', n);

  -- ── 4. Força reclassificação: NULL / SEM CLASSIFICAÇÃO → grupo fallback ──
  -- Último recurso absoluto; elimina qualquer linha sem tipo.
  UPDATE public.lc131_despesas
  SET tipo_despesa = CASE
    WHEN codigo_nome_grupo LIKE '1%' THEN 'PESSOAL E ENCARGOS SOCIAIS'
    WHEN codigo_nome_grupo LIKE '2%' THEN 'JUROS E ENCARGOS DA DÍVIDA'
    WHEN codigo_nome_grupo LIKE '3%' THEN 'OUTRAS DESPESAS CORRENTES'
    WHEN codigo_nome_grupo LIKE '4%' THEN 'INVESTIMENTOS'
    WHEN codigo_nome_grupo LIKE '5%' THEN 'INVERSÕES FINANCEIRAS'
    ELSE 'OUTRAS DESPESAS CORRENTES'
  END
  WHERE tipo_despesa IS NULL
     OR tipo_despesa = 'SEM CLASSIFICAÇÃO'
     OR TRIM(tipo_despesa) = '';
  GET DIAGNOSTICS n = ROW_COUNT;
  r := r || jsonb_build_object('sem_classificacao_fixed', n);

  -- ── 5. TABELA SUS PAULISTA → fonte Tesouro ───────────────────────────────
  UPDATE public.lc131_despesas
  SET codigo_nome_fonte_recurso = '01 - Tesouro - Fonte Ordinaria'
  WHERE tipo_despesa = 'TABELA SUS PAULISTA'
    AND codigo_nome_elemento NOT LIKE '%334130%'
    AND codigo_nome_fonte_recurso NOT LIKE '%163150%'
    AND (codigo_nome_fonte_recurso IS NULL
         OR lower(codigo_nome_fonte_recurso) NOT LIKE '%tesouro%');
  GET DIAGNOSTICS n = ROW_COUNT;
  r := r || jsonb_build_object('tabela_sus_fonte_fixed', n);

  -- ── 6. Reclassifica TABELA SUS com elemento 334130 ou fonte 163150 ───────
  UPDATE public.lc131_despesas
  SET tipo_despesa = CASE
    WHEN codigo_nome_grupo LIKE '3%' THEN 'OUTRAS DESPESAS CORRENTES'
    WHEN codigo_nome_grupo LIKE '4%' THEN 'INVESTIMENTOS'
    WHEN codigo_nome_grupo LIKE '1%' THEN 'PESSOAL E ENCARGOS SOCIAIS'
    ELSE 'OUTRAS DESPESAS CORRENTES'
  END
  WHERE tipo_despesa = 'TABELA SUS PAULISTA'
    AND (codigo_nome_elemento LIKE '%334130%'
         OR codigo_nome_fonte_recurso LIKE '%163150%');
  GET DIAGNOSTICS n = ROW_COUNT;
  r := r || jsonb_build_object('tabela_sus_reclassified', n);

  -- ── 7. Popula rotulo vazio com codigo_nome_projeto_atividade ────────────
  -- Executado automaticamente aqui para garantir rotulo preenchido após cada import.
  UPDATE public.lc131_despesas
  SET rotulo = TRIM(codigo_nome_projeto_atividade)
  WHERE (rotulo IS NULL OR rotulo = '')
    AND codigo_nome_projeto_atividade IS NOT NULL
    AND codigo_nome_projeto_atividade <> ''
    AND (p_ano IS NULL OR ano_referencia = p_ano);
  GET DIAGNOSTICS n = ROW_COUNT;
  r := r || jsonb_build_object('rotulo_filled', n);

  -- ── 8. Verificação final: linhas ainda sem classificação ─────────────────
  SELECT count(*) INTO n
  FROM public.lc131_despesas
  WHERE tipo_despesa IS NULL
     OR tipo_despesa = 'SEM CLASSIFICAÇÃO'
     OR TRIM(tipo_despesa) = '';
  r := r || jsonb_build_object('sem_classificacao_remaining', n);

  RETURN r;
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_import_cleanup(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.post_import_cleanup(INT) TO authenticated;

-- ================================================================
-- fix_drs_range — normaliza DRS em uma faixa de IDs (evita timeout)
-- Chamada em chunks de 10k pelo fix-drs.mjs
-- ================================================================

CREATE OR REPLACE FUNCTION public.fix_drs_range(p_id_min BIGINT, p_id_max BIGINT)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  n INT;
BEGIN
  UPDATE public.lc131_despesas
  SET drs = CASE drs
    WHEN '01 Grande São Paulo'       THEN 'DRS I - Grande São Paulo'
    WHEN '02 Araçatuba'              THEN 'DRS II - Araçatuba'
    WHEN '03 Araraquara'             THEN 'DRS III - Araraquara'
    WHEN '04 Baixada Santista'       THEN 'DRS IV - Baixada Santista'
    WHEN '05 Barretos'               THEN 'DRS V - Barretos'
    WHEN '06 Bauru'                  THEN 'DRS VI - Bauru'
    WHEN '07 Campinas'               THEN 'DRS VII - Campinas'
    WHEN '08 Franca'                 THEN 'DRS VIII - Franca'
    WHEN '09 Marília'                THEN 'DRS IX - Marília'
    WHEN '10 Piracicaba'             THEN 'DRS X - Piracicaba'
    WHEN '11 Presidente Prudente'    THEN 'DRS XI - Presidente Prudente'
    WHEN '12 Registro'               THEN 'DRS XII - Registro'
    WHEN '13 Ribeirão Preto'         THEN 'DRS XIII - Ribeirão Preto'
    WHEN '14 São João da Boa Vista'  THEN 'DRS XIV - São João da Boa Vista'
    WHEN '15 São José do Rio Preto'  THEN 'DRS XV - São José do Rio Preto'
    WHEN '16 Sorocaba'               THEN 'DRS XVI - Sorocaba'
    WHEN '17 Taubaté'                THEN 'DRS XVII - Taubaté'
    ELSE drs
  END
  WHERE id BETWEEN p_id_min AND p_id_max
    AND drs ~ E'^[0-9]{2} ';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fix_drs_range(BIGINT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.fix_drs_range(BIGINT, BIGINT) TO authenticated;
