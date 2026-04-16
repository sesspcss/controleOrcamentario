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
--   6. Limpa bd_ref_tipo (não necessário após classificação)
--   7. Retorna resumo em JSON
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
    WHEN '01 GRANDE SÃO PAULO'      THEN 'DRS I - GRANDE SÃO PAULO'
    WHEN '02 ARAÇATUBA'             THEN 'DRS II - ARAÇATUBA'
    WHEN '03 ARARAQUARA'            THEN 'DRS III - ARARAQUARA'
    WHEN '04 BAIXADA SANTISTA'      THEN 'DRS IV - BAIXADA SANTISTA'
    WHEN '05 BARRETOS'              THEN 'DRS V - BARRETOS'
    WHEN '06 BAURU'                 THEN 'DRS VI - BAURU'
    WHEN '07 CAMPINAS'              THEN 'DRS VII - CAMPINAS'
    WHEN '08 FRANCA'                THEN 'DRS VIII - FRANCA'
    WHEN '09 MARÍLIA'               THEN 'DRS IX - MARÍLIA'
    WHEN '10 PIRACICABA'            THEN 'DRS X - PIRACICABA'
    WHEN '11 PRESIDENTE PRUDENTE'   THEN 'DRS XI - PRESIDENTE PRUDENTE'
    WHEN '12 REGISTRO'              THEN 'DRS XII - REGISTRO'
    WHEN '13 RIBEIRÃO PRETO'        THEN 'DRS XIII - RIBEIRÃO PRETO'
    WHEN '14 SÃO JOÃO DA BOA VISTA' THEN 'DRS XIV - SÃO JOÃO DA BOA VISTA'
    WHEN '15 SÃO JOSÉ DO RIO PRETO' THEN 'DRS XV - SÃO JOSÉ DO RIO PRETO'
    WHEN '16 SOROCABA'              THEN 'DRS XVI - SOROCABA'
    WHEN '17 TAUBATÉ'               THEN 'DRS XVII - TAUBATÉ'
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

  -- ── 7. Limpa bd_ref_tipo (não necessário após classificação) ─────────────
  DELETE FROM public.bd_ref_tipo;
  GET DIAGNOSTICS n = ROW_COUNT;
  r := r || jsonb_build_object('bd_ref_tipo_cleared', n);

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
