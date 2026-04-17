-- ================================================================
-- post-import-fn.sql — Função post_import_cleanup
-- Deploy UMA VEZ no Supabase SQL Editor.
-- Executada automaticamente após cada import via post-import.mjs.
--
-- O QUE FAZ:
--   0. Aplica compressão lz4 nas colunas de texto (idempotente)
--   1. Normaliza DRS (prefixo numérico → algarismo romano)
--   2. Popula DRS/RRAS nulos pelo valor mais frequente do município
--   3. Força reclassificação de NULL / SEM CLASSIFICAÇÃO → grupo fallback
--   4. Corrige fonte_recurso de TABELA SUS PAULISTA → Tesouro
--   5. Reclassifica TABELA SUS com elemento 334130 ou fonte 163150
--   6. Popula rotulo vazio (codigo_nome_projeto_atividade)
--   7. TRUNCATE bd_ref_tipo (liberta ~200 MB — seguro: L1-4 já populados)
--   8. Retorna resumo em JSON com tamanho atual do banco
-- ================================================================

CREATE OR REPLACE FUNCTION public.post_import_cleanup(p_ano INT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET statement_timeout = 0    -- sem limite de tempo (mesmas garantias de fix_tipo)
AS $$
DECLARE
  r JSONB := '{}';
  n INT;
BEGIN

  -- ── 0. Compressão lz4 (idempotente, instantâneo, sem lock prolongado) ──
  -- Novas linhas inseridas/reescritas passarão a usar lz4.
  -- Linhas existentes migram para lz4 somente após VACUUM FULL/CLUSTER.
  ALTER TABLE public.lc131_despesas
    ALTER COLUMN codigo_nome_ug                SET COMPRESSION lz4,
    ALTER COLUMN codigo_nome_uo                SET COMPRESSION lz4,
    ALTER COLUMN codigo_nome_elemento          SET COMPRESSION lz4,
    ALTER COLUMN codigo_nome_grupo             SET COMPRESSION lz4,
    ALTER COLUMN codigo_nome_fonte_recurso     SET COMPRESSION lz4,
    ALTER COLUMN codigo_nome_projeto_atividade SET COMPRESSION lz4,
    ALTER COLUMN codigo_nome_favorecido        SET COMPRESSION lz4,
    ALTER COLUMN rotulo                        SET COMPRESSION lz4,
    ALTER COLUMN descricao_processo            SET COMPRESSION lz4,
    ALTER COLUMN municipio                     SET COMPRESSION lz4,
    ALTER COLUMN drs                           SET COMPRESSION lz4,
    ALTER COLUMN rras                          SET COMPRESSION lz4;

  -- ── 0.1: Autovacuum agressivo — limpa dead tuples automaticamente após cada import
  -- Com 1% de dead tuples (scale_factor = 0.01), autovacuum inicia sozinho logo após o import.
  -- Isso mantém o banco compacto sem necessidade de VACUUM FULL manual periódico.
  ALTER TABLE public.lc131_despesas SET (
    autovacuum_vacuum_scale_factor   = 0.01,
    autovacuum_analyze_scale_factor  = 0.01,
    autovacuum_vacuum_cost_delay     = 2
  );

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
  WHERE drs ~ E'^[0-9]{2} '
    AND (p_ano IS NULL OR ano_referencia = p_ano);
  GET DIAGNOSTICS n = ROW_COUNT;
  r := r || jsonb_build_object('drs_normalized', n);

  -- ── 2. Popula DRS nulo usando tab_municipios (lookup rápido, sem CTE full-scan) ──
  -- tab_municipios tem índice em municipio → muito mais rápido que CTE sobre lc131_despesas
  UPDATE public.lc131_despesas a
  SET drs = m.drs
  FROM public.tab_municipios m
  WHERE a.municipio = m.municipio
    AND m.drs IS NOT NULL AND m.drs <> ''
    AND (a.drs IS NULL OR a.drs = '')
    AND (p_ano IS NULL OR a.ano_referencia = p_ano);
  GET DIAGNOSTICS n = ROW_COUNT;
  r := r || jsonb_build_object('drs_filled', n);

  -- ── 3. Popula RRAS nulo usando tab_municipios (mesmo raciocínio) ──────────
  UPDATE public.lc131_despesas a
  SET rras = m.rras
  FROM public.tab_municipios m
  WHERE a.municipio = m.municipio
    AND m.rras IS NOT NULL AND m.rras <> ''
    AND (a.rras IS NULL OR a.rras = '')
    AND (p_ano IS NULL OR a.ano_referencia = p_ano);
  GET DIAGNOSTICS n = ROW_COUNT;
  r := r || jsonb_build_object('rras_filled', n);

  -- ── 2b. DRS: fallback por nome_municipio (ILIKE, sem normalização exata) ────────
  UPDATE public.lc131_despesas a
  SET drs = m.drs
  FROM public.tab_municipios m
  WHERE (a.drs IS NULL OR a.drs = '')
    AND a.nome_municipio IS NOT NULL AND a.nome_municipio <> ''
    AND upper(trim(a.nome_municipio)) = upper(m.municipio)
    AND m.drs IS NOT NULL AND m.drs <> ''
    AND (p_ano IS NULL OR a.ano_referencia = p_ano);
  GET DIAGNOSTICS n = ROW_COUNT;
  r := r || jsonb_build_object('drs_nome_municipio', n);

  -- ── 2c. DRS: fallback por cod_ibge ───────────────────────────────────────────
  UPDATE public.lc131_despesas a
  SET drs = m.drs
  FROM public.tab_municipios m
  WHERE (a.drs IS NULL OR a.drs = '')
    AND a.cod_ibge IS NOT NULL AND a.cod_ibge <> ''
    AND a.cod_ibge = m.cod_ibge
    AND m.drs IS NOT NULL AND m.drs <> ''
    AND (p_ano IS NULL OR a.ano_referencia = p_ano);
  GET DIAGNOSTICS n = ROW_COUNT;
  r := r || jsonb_build_object('drs_cod_ibge', n);

  -- ── 2d. DRS: extrai do texto de codigo_nome_uo ──────────────────────────────
  -- Verifica do numeral mais longo ao mais curto para evitar falsos positivos:
  -- '%DRS XI%' seria capturado por '%DRS XII%' se checado depois.
  UPDATE public.lc131_despesas
  SET drs = CASE
    WHEN upper(codigo_nome_uo) LIKE '%DRS XVII%' THEN 'DRS XVII - Taubaté'
    WHEN upper(codigo_nome_uo) LIKE '%DRS XVI%'  THEN 'DRS XVI - Sorocaba'
    WHEN upper(codigo_nome_uo) LIKE '%DRS XV%'   THEN 'DRS XV - São José do Rio Preto'
    WHEN upper(codigo_nome_uo) LIKE '%DRS XIV%'  THEN 'DRS XIV - São João da Boa Vista'
    WHEN upper(codigo_nome_uo) LIKE '%DRS XIII%' THEN 'DRS XIII - Ribeirão Preto'
    WHEN upper(codigo_nome_uo) LIKE '%DRS XII%'  THEN 'DRS XII - Registro'
    WHEN upper(codigo_nome_uo) LIKE '%DRS XI%'   THEN 'DRS XI - Presidente Prudente'
    WHEN upper(codigo_nome_uo) LIKE '%DRS X%'    THEN 'DRS X - Piracicaba'
    WHEN upper(codigo_nome_uo) LIKE '%DRS IX%'   THEN 'DRS IX - Marília'
    WHEN upper(codigo_nome_uo) LIKE '%DRS VIII%' THEN 'DRS VIII - Franca'
    WHEN upper(codigo_nome_uo) LIKE '%DRS VII%'  THEN 'DRS VII - Campinas'
    WHEN upper(codigo_nome_uo) LIKE '%DRS VI%'   THEN 'DRS VI - Bauru'
    WHEN upper(codigo_nome_uo) LIKE '%DRS V%'    THEN 'DRS V - Barretos'
    WHEN upper(codigo_nome_uo) LIKE '%DRS IV%'   THEN 'DRS IV - Baixada Santista'
    WHEN upper(codigo_nome_uo) LIKE '%DRS III%'  THEN 'DRS III - Araraquara'
    WHEN upper(codigo_nome_uo) LIKE '%DRS II%'   THEN 'DRS II - Araçatuba'
    WHEN upper(codigo_nome_uo) LIKE '%DRS I%'    THEN 'DRS I - Grande São Paulo'
  END
  WHERE (drs IS NULL OR drs = '')
    AND upper(codigo_nome_uo) LIKE '%DRS%'
    AND (p_ano IS NULL OR ano_referencia = p_ano);
  GET DIAGNOSTICS n = ROW_COUNT;
  r := r || jsonb_build_object('drs_from_uo', n);

  -- ── 2e. DRS: catch-all — órgãos centrais sem município → DRS I ──────────────
  -- Linhas sem município são unidades centrais do estado (Gabinete, CGA, CRH...)
  -- A Secretaria de Estado da Saúde é sediada em São Paulo = DRS I.
  UPDATE public.lc131_despesas
  SET drs = 'DRS I - Grande São Paulo'
  WHERE (drs IS NULL OR drs = '')
    AND (municipio IS NULL OR municipio = '')
    AND (nome_municipio IS NULL OR nome_municipio = '')
    AND (p_ano IS NULL OR ano_referencia = p_ano);
  GET DIAGNOSTICS n = ROW_COUNT;
  r := r || jsonb_build_object('drs_catch_all', n);

  -- ── 3b. RRAS: fallback por nome_municipio ────────────────────────────────────
  UPDATE public.lc131_despesas a
  SET rras = m.rras
  FROM public.tab_municipios m
  WHERE (a.rras IS NULL OR a.rras = '')
    AND a.nome_municipio IS NOT NULL AND a.nome_municipio <> ''
    AND upper(trim(a.nome_municipio)) = upper(m.municipio)
    AND m.rras IS NOT NULL AND m.rras <> ''
    AND (p_ano IS NULL OR a.ano_referencia = p_ano);
  GET DIAGNOSTICS n = ROW_COUNT;
  r := r || jsonb_build_object('rras_nome_municipio', n);

  -- ── 3c. RRAS: fallback por cod_ibge ──────────────────────────────────────────
  UPDATE public.lc131_despesas a
  SET rras = m.rras
  FROM public.tab_municipios m
  WHERE (a.rras IS NULL OR a.rras = '')
    AND a.cod_ibge IS NOT NULL AND a.cod_ibge <> ''
    AND a.cod_ibge = m.cod_ibge
    AND m.rras IS NOT NULL AND m.rras <> ''
    AND (p_ano IS NULL OR a.ano_referencia = p_ano);
  GET DIAGNOSTICS n = ROW_COUNT;
  r := r || jsonb_build_object('rras_cod_ibge', n);

  -- ── 3d. RRAS: catch-all — órgãos centrais sem município → RRAS 6 (SP) ────────
  UPDATE public.lc131_despesas
  SET rras = '6'
  WHERE (rras IS NULL OR rras = '')
    AND (municipio IS NULL OR municipio = '')
    AND (nome_municipio IS NULL OR nome_municipio = '')
    AND (p_ano IS NULL OR ano_referencia = p_ano);
  GET DIAGNOSTICS n = ROW_COUNT;
  r := r || jsonb_build_object('rras_catch_all', n);

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
  WHERE (tipo_despesa IS NULL
     OR tipo_despesa = 'SEM CLASSIFICAÇÃO'
     OR TRIM(tipo_despesa) = '')
    AND (p_ano IS NULL OR ano_referencia = p_ano);
  GET DIAGNOSTICS n = ROW_COUNT;
  r := r || jsonb_build_object('sem_classificacao_fixed', n);

  -- ── 5. TABELA SUS PAULISTA → fonte Tesouro ───────────────────────────────
  UPDATE public.lc131_despesas
  SET codigo_nome_fonte_recurso = '01 - Tesouro - Fonte Ordinaria'
  WHERE tipo_despesa = 'TABELA SUS PAULISTA'
    AND codigo_nome_elemento NOT LIKE '%334130%'
    AND codigo_nome_fonte_recurso NOT LIKE '%163150%'
    AND (codigo_nome_fonte_recurso IS NULL
         OR lower(codigo_nome_fonte_recurso) NOT LIKE '%tesouro%')
    AND (p_ano IS NULL OR ano_referencia = p_ano);
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
         OR codigo_nome_fonte_recurso LIKE '%163150%')
    AND (p_ano IS NULL OR ano_referencia = p_ano);
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

  -- ── 8. Libera bd_ref_tipo (>200MB) — seguro porque L1-4 já foram
  --        populados pelo refresh_bdref_lookup() no início do pipeline.
  --        refresh_bdref_lookup() agora preserva L1-4 se bd_ref_tipo estiver vazio.
  TRUNCATE TABLE public.bd_ref_tipo;
  r := r || jsonb_build_object('bd_ref_tipo_truncated', true);

  -- ── 8b. Drop índices redundantes (idempotente — IF EXISTS) ────────────────
  -- idx_lc131_ano        → coberto por idx_lc131_ano_id  (ano_referencia, id)
  -- idx_lc131_cod_projeto → coberto por idx_lc131_ano_cod_projeto
  -- DROP INDEX dentro de função roda em transação normal — sem CONCURRENTLY.
  DROP INDEX IF EXISTS public.idx_lc131_ano;
  DROP INDEX IF EXISTS public.idx_lc131_cod_projeto;
  r := r || jsonb_build_object('redundant_indexes_dropped', true);

  -- ── 9. Tamanho do banco após limpeza ─────────────────────────────────────
  SELECT pg_database_size(current_database()) INTO n;
  r := r || jsonb_build_object('db_size_bytes', n);

  -- ── 10. Verificação final: linhas ainda sem classificação ─────────────────
  SELECT count(*) INTO n
  FROM public.lc131_despesas
  WHERE tipo_despesa IS NULL
     OR tipo_despesa = 'SEM CLASSIFICAÇÃO'
     OR TRIM(tipo_despesa) = '';
  r := r || jsonb_build_object('sem_classificacao_remaining', n);

  -- ── 11. Agenda pg_cron VACUUM FULL DIÁRIO para TODAS as tabelas ─────────────
  -- Roda toda noite às 3h — garante que dead tuples do dia sejam removidos.
  -- Cada tabela tem horário ligeiramente diferente para não sobrecarregar.
  -- Se pg_cron não estiver habilitado, ignora silenciosamente.
  BEGIN
    -- Remove todos os jobs antigos de vacuum
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname LIKE 'vacuum-auto-%';
    -- lc131_despesas: maior tabela, roda primeiro
    PERFORM cron.schedule('vacuum-auto-lc131',    '0 3 * * *',
      'VACUUM FULL ANALYZE public.lc131_despesas');
    -- Lookups L1-4: pequenas, em série após a principal
    PERFORM cron.schedule('vacuum-auto-lookup-l1', '10 3 * * *',
      'VACUUM FULL ANALYZE public.bd_ref_lookup_l1');
    PERFORM cron.schedule('vacuum-auto-lookup-l2', '11 3 * * *',
      'VACUUM FULL ANALYZE public.bd_ref_lookup_l2');
    PERFORM cron.schedule('vacuum-auto-lookup-l3', '12 3 * * *',
      'VACUUM FULL ANALYZE public.bd_ref_lookup_l3');
    PERFORM cron.schedule('vacuum-auto-lookup-l4', '13 3 * * *',
      'VACUUM FULL ANALYZE public.bd_ref_lookup_l4');
    -- bd_ref e tab_municipios: tabelas de referência
    PERFORM cron.schedule('vacuum-auto-bdref',     '20 3 * * *',
      'VACUUM FULL ANALYZE public.bd_ref');
    PERFORM cron.schedule('vacuum-auto-municipios','21 3 * * *',
      'VACUUM FULL ANALYZE public.tab_municipios');
    r := r || jsonb_build_object('cron_vacuum_scheduled', true, 'cron_tables', 7);
  EXCEPTION WHEN OTHERS THEN
    r := r || jsonb_build_object('cron_vacuum_scheduled', false, 'cron_error', SQLERRM);
  END;

  RETURN r;
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_import_cleanup(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.post_import_cleanup(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_import_cleanup(INT) TO anon;

-- ================================================================
-- fill_rotulo_ano — fallback autônomo para preencher rótulo
-- Chamado pelo post-import.mjs se post_import_cleanup falhar ou
-- retornar rotulo_filled = 0.
-- Não depende de bd_ref_tipo, L1-4 nem de nenhuma outra função.
-- ================================================================
CREATE OR REPLACE FUNCTION public.fill_rotulo_ano(p_ano INT DEFAULT NULL)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER
SET statement_timeout = 0
AS $$
DECLARE n INT;
BEGIN
  UPDATE public.lc131_despesas
  SET rotulo = TRIM(codigo_nome_projeto_atividade)
  WHERE (rotulo IS NULL OR rotulo = '')
    AND codigo_nome_projeto_atividade IS NOT NULL
    AND codigo_nome_projeto_atividade <> ''
    AND (p_ano IS NULL OR ano_referencia = p_ano);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fill_rotulo_ano(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.fill_rotulo_ano(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fill_rotulo_ano(INT) TO anon;

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
