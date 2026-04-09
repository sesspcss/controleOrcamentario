-- ================================================================
-- FIX ONE-SHOT: Preencher TODAS as colunas vazias de uma vez
-- Executar NO Supabase SQL Editor (inteiro, de uma só vez)
-- ================================================================
SET statement_timeout = 0;

-- ─── 0. Criar norm_munic (idempotente) ──────────────────────
CREATE OR REPLACE FUNCTION public.norm_munic(t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT translate(
    UPPER(TRIM(COALESCE(t, ''))),
    'ÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇÑàáâãäåèéêëìíîïòóôõöùúûüçñ',
    'AAAAAAEEEEIIIIOOOOOUUUUCNaaaaaaeeeeiiiioooooouuuucn'
  );
$$;

-- ─── 1. Normalizar strings vazias → NULL ────────────────────
UPDATE lc131_despesas SET drs       = NULL WHERE drs       IS NOT NULL AND TRIM(drs)       = '';
UPDATE lc131_despesas SET rras      = NULL WHERE rras      IS NOT NULL AND TRIM(rras)      = '';
UPDATE lc131_despesas SET unidade   = NULL WHERE unidade   IS NOT NULL AND TRIM(unidade)   = '';
UPDATE lc131_despesas SET rotulo    = NULL WHERE rotulo    IS NOT NULL AND TRIM(rotulo)    = '';
UPDATE lc131_despesas SET regiao_ad = NULL WHERE regiao_ad IS NOT NULL AND TRIM(regiao_ad) = '';
UPDATE lc131_despesas SET regiao_sa = NULL WHERE regiao_sa IS NOT NULL AND TRIM(regiao_sa) = '';
UPDATE lc131_despesas SET municipio = NULL WHERE municipio IS NOT NULL AND TRIM(municipio) = '';
UPDATE lc131_despesas SET cod_ibge  = NULL WHERE cod_ibge  IS NOT NULL AND TRIM(cod_ibge)  = '';

-- ─── 2. DRS ← tab_drs (via municipio normalizado) ──────────
UPDATE lc131_despesas tgt
SET drs = td.drs
FROM tab_drs td
WHERE td.municipio = norm_munic(tgt.municipio)
  AND tgt.drs IS NULL
  AND tgt.municipio IS NOT NULL;

-- ─── 3. RRAS ← tab_rras (via municipio normalizado) ────────
UPDATE lc131_despesas tgt
SET rras = tr.rras
FROM tab_rras tr
WHERE tr.municipio = norm_munic(tgt.municipio)
  AND tgt.rras IS NULL
  AND tgt.municipio IS NOT NULL;

-- ─── 4. Enriquecimento via bd_ref (codigo_ug com LPAD) ─────
UPDATE lc131_despesas tgt
SET
  drs       = COALESCE(tgt.drs,       rb.drs),
  unidade   = COALESCE(tgt.unidade,   rb.unidade),
  regiao_ad = COALESCE(tgt.regiao_ad, rb.regiao_ad),
  regiao_sa = COALESCE(tgt.regiao_sa, rb.regiao_sa),
  cod_ibge  = COALESCE(tgt.cod_ibge,  rb.cod_ibge),
  municipio = COALESCE(tgt.municipio, rb.municipio)
FROM bd_ref rb
WHERE rb.codigo = LPAD(tgt.codigo_ug::text, 6, '0')
  AND (tgt.unidade IS NULL OR tgt.drs IS NULL OR tgt.regiao_ad IS NULL);

-- ─── 5. Enriquecimento via bd_ref (codigo_projeto_atividade) 
UPDATE lc131_despesas tgt
SET
  drs       = COALESCE(tgt.drs,       rb.drs),
  unidade   = COALESCE(tgt.unidade,   rb.unidade),
  regiao_ad = COALESCE(tgt.regiao_ad, rb.regiao_ad),
  regiao_sa = COALESCE(tgt.regiao_sa, rb.regiao_sa),
  cod_ibge  = COALESCE(tgt.cod_ibge,  rb.cod_ibge),
  municipio = COALESCE(tgt.municipio, rb.municipio)
FROM bd_ref rb
WHERE rb.codigo = LPAD(tgt.codigo_projeto_atividade::text, 6, '0')
  AND (tgt.unidade IS NULL OR tgt.drs IS NULL OR tgt.regiao_ad IS NULL);

-- ─── 6. Enriquecimento via bd_ref (codigo_nome_ug prefix) ──
UPDATE lc131_despesas tgt
SET
  drs       = COALESCE(tgt.drs,       rb.drs),
  unidade   = COALESCE(tgt.unidade,   rb.unidade),
  regiao_ad = COALESCE(tgt.regiao_ad, rb.regiao_ad),
  regiao_sa = COALESCE(tgt.regiao_sa, rb.regiao_sa),
  cod_ibge  = COALESCE(tgt.cod_ibge,  rb.cod_ibge),
  municipio = COALESCE(tgt.municipio, rb.municipio)
FROM bd_ref rb
WHERE rb.codigo = LPAD(
    NULLIF(regexp_replace(split_part(tgt.codigo_nome_ug::text, ' ', 1), '[^0-9]', '', 'g'), ''),
    6, '0')
  AND (tgt.unidade IS NULL OR tgt.drs IS NULL OR tgt.regiao_ad IS NULL);

-- ─── 7. Rótulo fallback (CASE por projeto_atividade) ────────
UPDATE lc131_despesas
SET rotulo = CASE
  WHEN codigo_nome_projeto_atividade ILIKE '%ambulat%'
    OR codigo_nome_projeto_atividade ILIKE '%hospitalar%'
    OR codigo_nome_projeto_atividade ILIKE '%rede%propria%'
    OR codigo_nome_projeto_atividade ILIKE '%bata cinza%'
    OR codigo_nome_projeto_atividade ILIKE '%UNICAMP%' THEN 'Assistência Hospitalar'
  WHEN codigo_nome_projeto_atividade ILIKE '%farmac%'
    OR codigo_nome_projeto_atividade ILIKE '%medicamento%' THEN 'Assistência Farmacêutica'
  WHEN codigo_nome_projeto_atividade ILIKE '%vigil%' THEN 'Vigilância em Saúde'
  WHEN codigo_nome_projeto_atividade ILIKE '%aparelh%'
    OR codigo_nome_projeto_atividade ILIKE '%equip%'
    OR codigo_nome_projeto_atividade ILIKE '%reform%'
    OR codigo_nome_projeto_atividade ILIKE '%construc%' THEN 'Infraestrutura'
  WHEN codigo_nome_projeto_atividade ILIKE '%admin%'
    OR codigo_nome_projeto_atividade ILIKE '%conselho%' THEN 'Gestão e Administração'
  WHEN codigo_nome_projeto_atividade ILIKE '%emenda%' THEN 'Emendas Parlamentares'
  WHEN codigo_nome_projeto_atividade ILIKE '%judicial%'
    OR codigo_nome_projeto_atividade ILIKE '%demanda%jud%' THEN 'Demandas Judiciais'
  WHEN codigo_nome_projeto_atividade ILIKE '%subvenc%'
    OR codigo_nome_projeto_atividade ILIKE '%filantrop%' THEN 'Entidades Filantrópicas'
  WHEN codigo_nome_projeto_atividade ILIKE '%resid%med%'
    OR codigo_nome_projeto_atividade ILIKE '%capacit%' THEN 'Formação e Capacitação'
  WHEN codigo_nome_projeto_atividade ILIKE '%descentraliz%'
    OR codigo_nome_projeto_atividade ILIKE '%prisional%' THEN 'Atenção Descentralizada'
  WHEN codigo_nome_projeto_atividade ILIKE '%publicidade%' THEN 'Comunicação'
  ELSE 'Outros'
END
WHERE rotulo IS NULL;

-- ─── 8. Preencher cod_ibge/regiao_ad/regiao_sa via tab_drs já populado ─
-- (para linhas que ganharam DRS mas ainda sem cod_ibge)
-- tab_drs só tem municipio+drs, então cod_ibge vem só de bd_ref (já feito)

-- ─── 9. Recalcular pago_total ───────────────────────────────
UPDATE lc131_despesas
SET pago_total = COALESCE(pago, 0) + COALESCE(pago_anos_anteriores, 0)
WHERE pago_total IS NULL
   OR pago_total <> COALESCE(pago, 0) + COALESCE(pago_anos_anteriores, 0);

-- ─── 10. Verificação final ──────────────────────────────────
SELECT
  COUNT(*)                                AS total,
  COUNT(drs)                              AS com_drs,
  COUNT(rras)                             AS com_rras,
  COUNT(unidade)                          AS com_unidade,
  COUNT(rotulo)                           AS com_rotulo,
  COUNT(municipio)                        AS com_municipio,
  COUNT(regiao_ad)                        AS com_regiao_ad,
  COUNT(regiao_sa)                        AS com_regiao_sa,
  COUNT(cod_ibge)                         AS com_cod_ibge
FROM lc131_despesas;
