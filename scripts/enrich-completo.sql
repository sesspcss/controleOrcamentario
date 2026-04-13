-- ================================================================
-- ENRIQUECIMENTO COMPLETO — Preencher TODAS as colunas vazias
-- usando APENAS tab_municipios + bd_ref (sem tab_drs / tab_rras)
--
-- Execute inteiro no Supabase SQL Editor.
-- Pode ser executado quantas vezes quiser — é idempotente.
--
-- ESTRATÉGIA (multi-passo, do mais confiável ao menos):
--   1.  tab_municipios ← nome_municipio  (campo oficial do Excel LC131)
--   2.  tab_municipios ← municipio       (campo normalizado)
--   3.  tab_municipios ← cod_ibge        (IBGE já gravado)
--   4.  bd_ref ← codigo_ug              (código da UG, 6 dígitos)
--   5.  bd_ref ← codigo_projeto_atividade
--   6.  bd_ref ← prefixo de codigo_nome_ug  (ex: "090196 - ...")
--   7.  Peer fill ← mesma UG já enriquecida  (propaga horizontalmente)
--   8.  Peer fill ← mesmo cod_ibge já enriquecido
--   9.  Rótulo fallback via CASE (código_nome_projeto_atividade)
--  10.  Recalcular pago_total
--  11.  Atualizar refresh_dashboard_batch para nova arquitetura
--  12.  Criar trigger para auto-enriquecimento em INSERT/UPDATE
-- ================================================================

SET statement_timeout = 0;
SET lock_timeout = '30min';

-- ================================================================
-- PRÉ-VERIFICAÇÃO
-- ================================================================
DO $$
DECLARE
  cnt_mun integer;
  cnt_ref integer;
BEGIN
  SELECT COUNT(*) INTO cnt_mun FROM public.tab_municipios;
  SELECT COUNT(*) INTO cnt_ref FROM public.bd_ref;
  RAISE NOTICE 'tab_municipios: % registros | bd_ref: % registros', cnt_mun, cnt_ref;
  IF cnt_mun = 0 THEN
    RAISE WARNING 'tab_municipios está VAZIA. Execute import-tab-municipios.mjs antes para melhores resultados.';
  END IF;
END $$;

-- ================================================================
-- PASSO 0: Garantir que norm_munic existe (idempotente)
-- ================================================================
CREATE OR REPLACE FUNCTION public.norm_munic(t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT translate(
    UPPER(TRIM(COALESCE(t, ''))),
    'ÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇÑàáâãäåèéêëìíîïòóôõöùúûüçñ',
    'AAAAAAEEEEIIIIOOOOOUUUUCNaaaaaaeeeeiiiioooooouuuucn'
  );
$$;

-- ================================================================
-- PASSO 0b: Normalizar strings vazias → NULL em todas as colunas
--           (evita que COALESCE trate '' como valor válido)
-- ================================================================
UPDATE public.lc131_despesas SET drs           = NULL WHERE drs           IS NOT NULL AND TRIM(drs)           = '';
UPDATE public.lc131_despesas SET rras          = NULL WHERE rras          IS NOT NULL AND TRIM(rras)          = '';
UPDATE public.lc131_despesas SET unidade       = NULL WHERE unidade       IS NOT NULL AND TRIM(unidade)       = '';
UPDATE public.lc131_despesas SET rotulo        = NULL WHERE rotulo        IS NOT NULL AND TRIM(rotulo)        = '';
UPDATE public.lc131_despesas SET regiao_ad     = NULL WHERE regiao_ad     IS NOT NULL AND TRIM(regiao_ad)     = '';
UPDATE public.lc131_despesas SET regiao_sa     = NULL WHERE regiao_sa     IS NOT NULL AND TRIM(regiao_sa)     = '';
UPDATE public.lc131_despesas SET municipio     = NULL WHERE municipio     IS NOT NULL AND TRIM(municipio)     = '';
UPDATE public.lc131_despesas SET cod_ibge      = NULL WHERE cod_ibge      IS NOT NULL AND TRIM(cod_ibge)      = '';
UPDATE public.lc131_despesas SET fonte_recurso = NULL WHERE fonte_recurso IS NOT NULL AND TRIM(fonte_recurso) = '';
UPDATE public.lc131_despesas SET grupo_despesa = NULL WHERE grupo_despesa IS NOT NULL AND TRIM(grupo_despesa) = '';
UPDATE public.lc131_despesas SET tipo_despesa  = NULL WHERE tipo_despesa  IS NOT NULL AND TRIM(tipo_despesa)  = '';

-- ================================================================
-- PASSO 1: tab_municipios via nome_municipio
--          (campo direto do arquivo LC131 — mais confiável)
-- ================================================================
UPDATE public.lc131_despesas tgt
SET
  drs       = COALESCE(tgt.drs,       tm.drs),
  rras      = COALESCE(tgt.rras,      tm.rras),
  regiao_ad = COALESCE(tgt.regiao_ad, tm.regiao_ad),
  regiao_sa = COALESCE(tgt.regiao_sa, tm.regiao_sa),
  cod_ibge  = COALESCE(tgt.cod_ibge,  tm.cod_ibge),
  municipio = COALESCE(tgt.municipio, tm.municipio_orig, tm.municipio)
FROM public.tab_municipios tm
WHERE tm.municipio = public.norm_munic(tgt.nome_municipio)
  AND tgt.nome_municipio IS NOT NULL
  AND TRIM(tgt.nome_municipio) <> ''
  AND (tgt.drs IS NULL OR tgt.rras IS NULL OR tgt.regiao_ad IS NULL OR tgt.regiao_sa IS NULL);

-- ================================================================
-- PASSO 2: tab_municipios via campo municipio normalizado
--          (fallback — campo pode estar em maiúsculas sem acento)
-- ================================================================
UPDATE public.lc131_despesas tgt
SET
  drs       = COALESCE(tgt.drs,       tm.drs),
  rras      = COALESCE(tgt.rras,      tm.rras),
  regiao_ad = COALESCE(tgt.regiao_ad, tm.regiao_ad),
  regiao_sa = COALESCE(tgt.regiao_sa, tm.regiao_sa),
  cod_ibge  = COALESCE(tgt.cod_ibge,  tm.cod_ibge),
  municipio = COALESCE(tgt.municipio, tm.municipio_orig, tm.municipio)
FROM public.tab_municipios tm
WHERE tm.municipio = public.norm_munic(tgt.municipio)
  AND tgt.municipio IS NOT NULL
  AND TRIM(tgt.municipio) <> ''
  AND (tgt.drs IS NULL OR tgt.rras IS NULL OR tgt.regiao_ad IS NULL);

-- ================================================================
-- PASSO 3: tab_municipios via cod_ibge já gravado
--          (para linhas onde o IBGE está preenchido mas DRS/RRAS não)
-- ================================================================
UPDATE public.lc131_despesas tgt
SET
  drs       = COALESCE(tgt.drs,       tm.drs),
  rras      = COALESCE(tgt.rras,      tm.rras),
  regiao_ad = COALESCE(tgt.regiao_ad, tm.regiao_ad),
  regiao_sa = COALESCE(tgt.regiao_sa, tm.regiao_sa),
  municipio = COALESCE(tgt.municipio, tm.municipio_orig, tm.municipio)
FROM public.tab_municipios tm
WHERE tm.cod_ibge = tgt.cod_ibge
  AND tgt.cod_ibge IS NOT NULL
  AND TRIM(tgt.cod_ibge) <> ''
  AND (tgt.drs IS NULL OR tgt.rras IS NULL OR tgt.regiao_ad IS NULL);

-- ================================================================
-- PASSO 4: bd_ref via codigo_ug (chave UG com 6 dígitos)
-- ================================================================
UPDATE public.lc131_despesas tgt
SET
  drs           = COALESCE(tgt.drs,           rb.drs),
  rras          = COALESCE(tgt.rras,          rb.rras),
  regiao_ad     = COALESCE(tgt.regiao_ad,     rb.regiao_ad),
  regiao_sa     = COALESCE(tgt.regiao_sa,     rb.regiao_sa),
  cod_ibge      = COALESCE(tgt.cod_ibge,      rb.cod_ibge),
  municipio     = COALESCE(tgt.municipio,     rb.municipio),
  unidade       = COALESCE(tgt.unidade,       rb.unidade),
  fonte_recurso = COALESCE(tgt.fonte_recurso, rb.fonte_recurso),
  grupo_despesa = COALESCE(tgt.grupo_despesa, rb.grupo_despesa),
  tipo_despesa  = COALESCE(tgt.tipo_despesa,  rb.tipo_despesa),
  rotulo        = COALESCE(tgt.rotulo,        rb.rotulo)
FROM public.bd_ref rb
WHERE rb.codigo = LPAD(tgt.codigo_ug::text, 6, '0')
  AND tgt.codigo_ug IS NOT NULL
  AND (tgt.drs IS NULL OR tgt.unidade IS NULL OR tgt.regiao_ad IS NULL);

-- ================================================================
-- PASSO 5: bd_ref via codigo_projeto_atividade
-- ================================================================
UPDATE public.lc131_despesas tgt
SET
  drs           = COALESCE(tgt.drs,           rb.drs),
  rras          = COALESCE(tgt.rras,          rb.rras),
  regiao_ad     = COALESCE(tgt.regiao_ad,     rb.regiao_ad),
  regiao_sa     = COALESCE(tgt.regiao_sa,     rb.regiao_sa),
  cod_ibge      = COALESCE(tgt.cod_ibge,      rb.cod_ibge),
  municipio     = COALESCE(tgt.municipio,     rb.municipio),
  unidade       = COALESCE(tgt.unidade,       rb.unidade),
  fonte_recurso = COALESCE(tgt.fonte_recurso, rb.fonte_recurso),
  grupo_despesa = COALESCE(tgt.grupo_despesa, rb.grupo_despesa),
  tipo_despesa  = COALESCE(tgt.tipo_despesa,  rb.tipo_despesa),
  rotulo        = COALESCE(tgt.rotulo,        rb.rotulo)
FROM public.bd_ref rb
WHERE rb.codigo = LPAD(tgt.codigo_projeto_atividade::text, 6, '0')
  AND tgt.codigo_projeto_atividade IS NOT NULL
  AND (tgt.drs IS NULL OR tgt.unidade IS NULL OR tgt.regiao_ad IS NULL);

-- ================================================================
-- PASSO 6: bd_ref via prefixo de codigo_nome_ug  (ex: "090196 - COORD...")
-- ================================================================
UPDATE public.lc131_despesas tgt
SET
  drs           = COALESCE(tgt.drs,           rb.drs),
  rras          = COALESCE(tgt.rras,          rb.rras),
  regiao_ad     = COALESCE(tgt.regiao_ad,     rb.regiao_ad),
  regiao_sa     = COALESCE(tgt.regiao_sa,     rb.regiao_sa),
  cod_ibge      = COALESCE(tgt.cod_ibge,      rb.cod_ibge),
  municipio     = COALESCE(tgt.municipio,     rb.municipio),
  unidade       = COALESCE(tgt.unidade,       rb.unidade),
  fonte_recurso = COALESCE(tgt.fonte_recurso, rb.fonte_recurso),
  grupo_despesa = COALESCE(tgt.grupo_despesa, rb.grupo_despesa),
  tipo_despesa  = COALESCE(tgt.tipo_despesa,  rb.tipo_despesa),
  rotulo        = COALESCE(tgt.rotulo,        rb.rotulo)
FROM public.bd_ref rb
WHERE rb.codigo = LPAD(
      NULLIF(regexp_replace(
        split_part(tgt.codigo_nome_ug::text, ' ', 1),
        '[^0-9]', '', 'g'), ''),
      6, '0')
  AND tgt.codigo_nome_ug IS NOT NULL
  AND (tgt.drs IS NULL OR tgt.unidade IS NULL OR tgt.regiao_ad IS NULL);

-- ================================================================
-- PASSO 7: Peer fill via mesma UG (codigo_ug)
--          Propaga DRS/RRAS entre linhas da mesma UG já enriquecida.
--          Útil quando apenas algumas linhas da UG foram enriquecidas.
-- ================================================================
UPDATE public.lc131_despesas tgt
SET
  drs       = COALESCE(tgt.drs,       src.drs),
  rras      = COALESCE(tgt.rras,      src.rras),
  regiao_ad = COALESCE(tgt.regiao_ad, src.regiao_ad),
  regiao_sa = COALESCE(tgt.regiao_sa, src.regiao_sa),
  cod_ibge  = COALESCE(tgt.cod_ibge,  src.cod_ibge),
  municipio = COALESCE(tgt.municipio, src.municipio),
  unidade   = COALESCE(tgt.unidade,   src.unidade)
FROM (
  SELECT DISTINCT ON (codigo_ug)
    codigo_ug, drs, rras, regiao_ad, regiao_sa, cod_ibge, municipio, unidade
  FROM public.lc131_despesas
  WHERE codigo_ug IS NOT NULL
    AND drs IS NOT NULL
    AND rras IS NOT NULL
  ORDER BY codigo_ug, id
) src
WHERE tgt.codigo_ug = src.codigo_ug
  AND tgt.codigo_ug IS NOT NULL
  AND (tgt.drs IS NULL OR tgt.rras IS NULL OR tgt.regiao_ad IS NULL);

-- ================================================================
-- PASSO 8: Peer fill via cod_ibge
--          Para linhas com IBGE preenchido, copia da tabela de municípios
--          ou de linhas vizinhas que já tenham DRS.
-- ================================================================
UPDATE public.lc131_despesas tgt
SET
  drs       = COALESCE(tgt.drs,       src.drs),
  rras      = COALESCE(tgt.rras,      src.rras),
  regiao_ad = COALESCE(tgt.regiao_ad, src.regiao_ad),
  regiao_sa = COALESCE(tgt.regiao_sa, src.regiao_sa),
  municipio = COALESCE(tgt.municipio, src.municipio)
FROM (
  SELECT DISTINCT ON (cod_ibge)
    cod_ibge, drs, rras, regiao_ad, regiao_sa, municipio
  FROM public.lc131_despesas
  WHERE cod_ibge IS NOT NULL
    AND drs IS NOT NULL
  ORDER BY cod_ibge, id
) src
WHERE tgt.cod_ibge = src.cod_ibge
  AND tgt.cod_ibge IS NOT NULL
  AND (tgt.drs IS NULL OR tgt.rras IS NULL);

-- ================================================================
-- PASSO 9: Preencher municipio a partir de nome_municipio
--          (quando municipio ainda está NULL mas nome_municipio está)
-- ================================================================
UPDATE public.lc131_despesas
SET municipio = norm_munic(nome_municipio)
WHERE municipio IS NULL
  AND nome_municipio IS NOT NULL
  AND TRIM(nome_municipio) <> '';

-- ================================================================
-- PASSO 10: Rótulo fallback via CASE (quando bd_ref não tinha rótulo)
-- ================================================================
UPDATE public.lc131_despesas
SET rotulo = CASE
  WHEN codigo_nome_projeto_atividade ILIKE '%ambulat%'
    OR codigo_nome_projeto_atividade ILIKE '%hospitalar%'
    OR codigo_nome_projeto_atividade ILIKE '%rede%propria%'
    OR codigo_nome_projeto_atividade ILIKE '%bata cinza%'
    OR codigo_nome_projeto_atividade ILIKE '%UNICAMP%'         THEN 'Assistência Hospitalar'
  WHEN codigo_nome_projeto_atividade ILIKE '%farmac%'
    OR codigo_nome_projeto_atividade ILIKE '%medicamento%'     THEN 'Assistência Farmacêutica'
  WHEN codigo_nome_projeto_atividade ILIKE '%vigil%'           THEN 'Vigilância em Saúde'
  WHEN codigo_nome_projeto_atividade ILIKE '%aparelh%'
    OR codigo_nome_projeto_atividade ILIKE '%equip%'
    OR codigo_nome_projeto_atividade ILIKE '%reform%'
    OR codigo_nome_projeto_atividade ILIKE '%construc%'        THEN 'Infraestrutura'
  WHEN codigo_nome_projeto_atividade ILIKE '%admin%'
    OR codigo_nome_projeto_atividade ILIKE '%conselho%'        THEN 'Gestão e Administração'
  WHEN codigo_nome_projeto_atividade ILIKE '%emenda%'          THEN 'Emendas Parlamentares'
  WHEN codigo_nome_projeto_atividade ILIKE '%judicial%'
    OR codigo_nome_projeto_atividade ILIKE '%demanda%jud%'     THEN 'Demandas Judiciais'
  WHEN codigo_nome_projeto_atividade ILIKE '%subvenc%'
    OR codigo_nome_projeto_atividade ILIKE '%filantrop%'       THEN 'Entidades Filantrópicas'
  WHEN codigo_nome_projeto_atividade ILIKE '%resid%med%'
    OR codigo_nome_projeto_atividade ILIKE '%capacit%'         THEN 'Formação e Capacitação'
  WHEN codigo_nome_projeto_atividade ILIKE '%descentraliz%'
    OR codigo_nome_projeto_atividade ILIKE '%prisional%'       THEN 'Atenção Descentralizada'
  WHEN codigo_nome_projeto_atividade ILIKE '%publicidade%'     THEN 'Comunicação'
  ELSE 'Outros'
END
WHERE rotulo IS NULL;

-- Também preencher grupo_despesa a partir de codigo_nome_grupo
UPDATE public.lc131_despesas
SET grupo_despesa = codigo_nome_grupo
WHERE grupo_despesa IS NULL
  AND codigo_nome_grupo IS NOT NULL
  AND TRIM(codigo_nome_grupo) <> '';

-- ================================================================
-- PASSO 11: Recalcular pago_total
-- ================================================================
UPDATE public.lc131_despesas
SET pago_total = COALESCE(pago, 0) + COALESCE(pago_anos_anteriores, 0)
WHERE pago_total IS NULL
   OR pago_total <> COALESCE(pago, 0) + COALESCE(pago_anos_anteriores, 0);

-- ================================================================
-- PASSO 12: Atualizar refresh_dashboard_batch
--           Versão sem dependência de tab_drs / tab_rras
-- ================================================================
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
    WHERE drs       IS NULL
       OR rras      IS NULL
       OR regiao_ad IS NULL
       OR rotulo    IS NULL
    LIMIT p_batch_size
  ),
  enriched AS (
    SELECT
      lc.id,
      -- Geográfico: tab_municipios primeiro (via nome_municipio, municipio, cod_ibge), depois bd_ref
      NULLIF(TRIM(COALESCE(tm1.drs, tm2.drs, tm3.drs, rb1.drs, rb2.drs, rb3.drs)), '') AS e_drs,
      NULLIF(TRIM(COALESCE(tm1.rras, tm2.rras, tm3.rras)),                           '') AS e_rras,
      COALESCE(tm1.regiao_ad, tm2.regiao_ad, tm3.regiao_ad, rb1.regiao_ad, rb2.regiao_ad, rb3.regiao_ad) AS e_regiao_ad,
      COALESCE(tm1.regiao_sa, tm2.regiao_sa, tm3.regiao_sa, rb1.regiao_sa, rb2.regiao_sa, rb3.regiao_sa) AS e_regiao_sa,
      COALESCE(tm1.cod_ibge,  tm2.cod_ibge,  tm3.cod_ibge,  rb1.cod_ibge,  rb2.cod_ibge,  rb3.cod_ibge)  AS e_cod_ibge,
      COALESCE(
        lc.nome_municipio,
        tm1.municipio_orig, tm2.municipio_orig, tm3.municipio_orig,
        rb1.municipio, rb2.municipio, rb3.municipio
      ) AS e_municipio,
      COALESCE(rb1.unidade,       rb2.unidade,       rb3.unidade)       AS e_unidade,
      COALESCE(rb1.fonte_recurso, rb2.fonte_recurso, rb3.fonte_recurso) AS e_fonte,
      COALESCE(rb1.grupo_despesa, rb2.grupo_despesa, rb3.grupo_despesa,
               lc.codigo_nome_grupo)                                    AS e_grupo,
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
    -- tab_municipios via nome_municipio (1º)
    LEFT JOIN tab_municipios tm1 ON tm1.municipio = norm_munic(lc.nome_municipio)
    -- tab_municipios via municipio (2º)
    LEFT JOIN tab_municipios tm2 ON tm2.municipio = norm_munic(lc.municipio)
    -- tab_municipios via cod_ibge (3º)
    LEFT JOIN tab_municipios tm3 ON tm3.cod_ibge = lc.cod_ibge
    -- bd_ref via codigo_projeto_atividade (4º)
    LEFT JOIN bd_ref rb1 ON rb1.codigo = LPAD(lc.codigo_projeto_atividade::text, 6, '0')
    -- bd_ref via codigo_ug (5º)
    LEFT JOIN bd_ref rb2 ON rb2.codigo = LPAD(lc.codigo_ug::text, 6, '0')
    -- bd_ref via prefixo de codigo_nome_ug (6º)
    LEFT JOIN bd_ref rb3 ON rb3.codigo = LPAD(
        NULLIF(regexp_replace(split_part(lc.codigo_nome_ug::text, ' ', 1), '[^0-9]', '', 'g'), ''),
        6, '0')
  )
  UPDATE lc131_despesas tgt
  SET
    drs           = COALESCE(enriched.e_drs,       tgt.drs),
    rras          = COALESCE(enriched.e_rras,       tgt.rras),
    regiao_ad     = COALESCE(enriched.e_regiao_ad,  tgt.regiao_ad),
    regiao_sa     = COALESCE(enriched.e_regiao_sa,  tgt.regiao_sa),
    cod_ibge      = COALESCE(enriched.e_cod_ibge,   tgt.cod_ibge),
    municipio     = COALESCE(enriched.e_municipio,  tgt.municipio),
    unidade       = COALESCE(enriched.e_unidade,    tgt.unidade),
    fonte_recurso = COALESCE(enriched.e_fonte,      tgt.fonte_recurso),
    grupo_despesa = COALESCE(enriched.e_grupo,      tgt.grupo_despesa),
    tipo_despesa  = COALESCE(enriched.e_tipo,       tgt.tipo_despesa),
    rotulo        = COALESCE(enriched.e_rotulo,     tgt.rotulo),
    pago_total    = COALESCE(tgt.pago, 0) + COALESCE(tgt.pago_anos_anteriores, 0)
  FROM enriched
  WHERE tgt.id = enriched.id;

  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_dashboard_batch(integer) TO anon, authenticated;


-- ================================================================
-- PASSO 13: Trigger para auto-enriquecimento em INSERT
--           Evita que futuras importações deixem colunas vazias
-- ================================================================
CREATE OR REPLACE FUNCTION public.trg_enrich_lc131()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tm  public.tab_municipios%ROWTYPE;
  v_rb  public.bd_ref%ROWTYPE;
BEGIN
  -- 1) tab_municipios via nome_municipio
  IF NEW.nome_municipio IS NOT NULL AND TRIM(NEW.nome_municipio) <> '' THEN
    SELECT * INTO v_tm FROM public.tab_municipios
    WHERE municipio = public.norm_munic(NEW.nome_municipio)
    LIMIT 1;
  END IF;

  -- 2) tab_municipios via municipio (fallback)
  IF v_tm IS NULL AND NEW.municipio IS NOT NULL AND TRIM(NEW.municipio) <> '' THEN
    SELECT * INTO v_tm FROM public.tab_municipios
    WHERE municipio = public.norm_munic(NEW.municipio)
    LIMIT 1;
  END IF;

  -- 3) tab_municipios via cod_ibge (fallback)
  IF v_tm IS NULL AND NEW.cod_ibge IS NOT NULL AND TRIM(NEW.cod_ibge) <> '' THEN
    SELECT * INTO v_tm FROM public.tab_municipios
    WHERE cod_ibge = NEW.cod_ibge
    LIMIT 1;
  END IF;

  -- 4) bd_ref via codigo_ug
  IF NEW.codigo_ug IS NOT NULL THEN
    SELECT * INTO v_rb FROM public.bd_ref
    WHERE codigo = LPAD(NEW.codigo_ug::text, 6, '0')
    LIMIT 1;
  END IF;

  -- 5) bd_ref via codigo_projeto_atividade (fallback)
  IF (v_rb IS NULL OR v_rb.drs IS NULL) AND NEW.codigo_projeto_atividade IS NOT NULL THEN
    SELECT * INTO v_rb FROM public.bd_ref
    WHERE codigo = LPAD(NEW.codigo_projeto_atividade::text, 6, '0')
    LIMIT 1;
  END IF;

  -- Aplicar enriquecimento (nunca sobrescreve valor existente)
  IF v_tm IS NOT NULL THEN
    NEW.drs       := COALESCE(NULLIF(TRIM(NEW.drs),''),       v_tm.drs);
    NEW.rras      := COALESCE(NULLIF(TRIM(NEW.rras),''),      v_tm.rras);
    NEW.regiao_ad := COALESCE(NULLIF(TRIM(NEW.regiao_ad),''), v_tm.regiao_ad);
    NEW.regiao_sa := COALESCE(NULLIF(TRIM(NEW.regiao_sa),''), v_tm.regiao_sa);
    NEW.cod_ibge  := COALESCE(NULLIF(TRIM(NEW.cod_ibge),''),  v_tm.cod_ibge);
    NEW.municipio := COALESCE(NULLIF(TRIM(NEW.municipio),''), v_tm.municipio_orig, v_tm.municipio);
  END IF;

  IF v_rb IS NOT NULL THEN
    NEW.drs           := COALESCE(NULLIF(TRIM(NEW.drs),''),           v_rb.drs);
    NEW.regiao_ad     := COALESCE(NULLIF(TRIM(NEW.regiao_ad),''),     v_rb.regiao_ad);
    NEW.regiao_sa     := COALESCE(NULLIF(TRIM(NEW.regiao_sa),''),     v_rb.regiao_sa);
    NEW.cod_ibge      := COALESCE(NULLIF(TRIM(NEW.cod_ibge),''),      v_rb.cod_ibge);
    NEW.municipio     := COALESCE(NULLIF(TRIM(NEW.municipio),''),     v_rb.municipio);
    NEW.unidade       := COALESCE(NULLIF(TRIM(NEW.unidade),''),       v_rb.unidade);
    NEW.fonte_recurso := COALESCE(NULLIF(TRIM(NEW.fonte_recurso),''), v_rb.fonte_recurso);
    NEW.grupo_despesa := COALESCE(NULLIF(TRIM(NEW.grupo_despesa),''), v_rb.grupo_despesa);
    NEW.tipo_despesa  := COALESCE(NULLIF(TRIM(NEW.tipo_despesa),''),  v_rb.tipo_despesa);
    NEW.rotulo        := COALESCE(NULLIF(TRIM(NEW.rotulo),''),        v_rb.rotulo);
  END IF;

  -- Fallback grupo_despesa
  IF NEW.grupo_despesa IS NULL AND NEW.codigo_nome_grupo IS NOT NULL THEN
    NEW.grupo_despesa := TRIM(NEW.codigo_nome_grupo);
  END IF;

  -- Fallback municipio
  IF NEW.municipio IS NULL AND NEW.nome_municipio IS NOT NULL THEN
    NEW.municipio := public.norm_munic(NEW.nome_municipio);
  END IF;

  -- Calcular pago_total
  NEW.pago_total := COALESCE(NEW.pago, 0) + COALESCE(NEW.pago_anos_anteriores, 0);

  RETURN NEW;
END;
$$;

-- Remover trigger antigo se existir
DROP TRIGGER IF EXISTS trg_enrich_before_insert ON public.lc131_despesas;

-- Criar trigger para INSERT e UPDATE
CREATE TRIGGER trg_enrich_before_insert
BEFORE INSERT OR UPDATE ON public.lc131_despesas
FOR EACH ROW EXECUTE FUNCTION public.trg_enrich_lc131();

-- Permissões
GRANT EXECUTE ON FUNCTION public.trg_enrich_lc131() TO service_role;


-- ================================================================
-- VERIFICAÇÃO FINAL — estatísticas por ano
-- ================================================================
SELECT
  ano_referencia                                                     AS ano,
  COUNT(*)                                                           AS total,
  COUNT(drs)                                                         AS com_drs,
  COUNT(rras)                                                        AS com_rras,
  COUNT(regiao_ad)                                                   AS com_regiao_ad,
  COUNT(municipio)                                                   AS com_municipio,
  COUNT(rotulo)                                                      AS com_rotulo,
  ROUND(COUNT(drs)::numeric      / COUNT(*) * 100, 1)               AS pct_drs,
  ROUND(COUNT(rras)::numeric     / COUNT(*) * 100, 1)               AS pct_rras,
  ROUND(COUNT(regiao_ad)::numeric/ COUNT(*) * 100, 1)               AS pct_regiao_ad
FROM public.lc131_despesas
GROUP BY ano_referencia
ORDER BY ano_referencia;

-- Total geral
SELECT
  COUNT(*)                                AS total_geral,
  COUNT(drs)                              AS com_drs,
  COUNT(rras)                             AS com_rras,
  COUNT(regiao_ad)                        AS com_regiao_ad,
  COUNT(municipio)                        AS com_municipio,
  COUNT(rotulo)                           AS com_rotulo,
  COUNT(*) - COUNT(drs)                   AS sem_drs,
  COUNT(*) - COUNT(rras)                  AS sem_rras,
  COUNT(*) - COUNT(municipio)             AS sem_municipio
FROM public.lc131_despesas;

NOTIFY pgrst, 'reload schema';
