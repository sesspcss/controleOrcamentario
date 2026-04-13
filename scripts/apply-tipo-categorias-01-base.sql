SET statement_timeout = 0;

-- Base de classificação e preparação leve
DROP TABLE    IF EXISTS public.tipo_despesa_ref CASCADE;
DROP FUNCTION IF EXISTS public.normalize_tipo_despesa_text(text);
DROP FUNCTION IF EXISTS public.canonicalize_tipo_despesa(text);
DROP FUNCTION IF EXISTS public.refresh_tipo_despesa_classif_batch(integer);
DROP FUNCTION IF EXISTS public.set_tipo_despesa_classif();

CREATE OR REPLACE FUNCTION public.classify_tipo_despesa(
  p_descricao text,
  p_tipo      text
) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public
AS $$
SELECT CASE
  WHEN p_descricao ILIKE 'INTRA'
    OR p_descricao ILIKE '%BATA CINZA%' THEN 'INTRAORÇAMENTÁRIA - BATA CINZA PPP'
  WHEN p_descricao ILIKE '%TRANSFERENCIA INTRA ORCAMENTARIA%'
    OR p_descricao ILIKE '%INTRA ORCAMENTARIA%'
    OR p_descricao ILIKE '%SECRETARIA DESENVOLVIMENTO SOCIAL%'
    OR p_descricao ILIKE '%TRANSFERENCIA INTRAORCAMENTARIA%' THEN 'INTRAORÇAMENTÁRIA'
  WHEN p_descricao ILIKE 'INTRAORCAMENTARIA'
    OR p_descricao ILIKE 'INTRAORÇAMENTÁRIA' THEN 'DIVIDA EXTERNA E INTERNA'
  WHEN p_descricao ILIKE '%FUNDO A FUNDO PAB%' THEN 'FUNDO A FUNDO PAB'
  WHEN p_descricao ILIKE '%RESIDENCIA TERAPEUTICA%'
    OR p_descricao ILIKE '%RESIDÊNCIA TERAPÊUTICA%'
    OR p_descricao ILIKE '%FUNDO A FUNDO RESIDENCIA%'
    OR p_descricao ILIKE '%FUNDO A FUNDO - RESIDENCIA%'
    OR p_descricao ILIKE '%RESOLUCAO SS N. 31%' THEN 'RESIDÊNCIA TERAPÊUTICA'
  WHEN p_descricao ILIKE '%FUNDO A FUNDO%DEMANDAS%'
    OR p_descricao ILIKE '%FUNDO A FUNDO - DEMANDAS%' THEN 'FUNDO A FUNDO - DEMANDAS PARLAMENTARES'
  WHEN p_descricao ILIKE '%FUNDO A FUNDO%EMENDA%'
    OR p_descricao ILIKE '%FUNDO A FUNDO - EMENDA%' THEN 'FUNDO A FUNDO - EMENDA'
  WHEN p_descricao ILIKE '%FUNDO A FUNDO%' THEN 'FUNDO A FUNDO'
  WHEN p_descricao ILIKE '%RLM FERNANDOPOLIS%'
    OR p_descricao ILIKE '%RLM FERNANDÓPOLIS%' THEN 'RLM FERNANDÓPOLIS'
  WHEN p_descricao ILIKE '%RLM MOGI MIRIM%'
    OR p_descricao ILIKE '%LUCY MONTORO MOGI MIRIM%' THEN 'RLM MOGI MIRIM'
  WHEN p_descricao ILIKE '%RLM SAO JOSE DOS CAMPOS%'
    OR p_descricao ILIKE '%RLM SÃO JOSE DOS CAMPOS%'
    OR (p_descricao ILIKE '%RLM%'
      AND (p_descricao ILIKE '%S. J. CAMPOS%'
        OR p_descricao ILIKE '%SAO JOSE DOS CAMPOS%'
        OR p_descricao ILIKE '%SÃO JOSE DOS CAMPOS%'))
    OR p_descricao ILIKE '%LUCY MONTORO%SAO JOSE DOS CAMPOS%'
    OR p_descricao ILIKE '%CUSTEIO PARA ATENDER RLM%CAMPOS%' THEN 'RLM SÃO JOSÉ DOS CAMPOS'
  WHEN p_descricao ILIKE '%RLM%RIO PRETO%'
    OR p_descricao ILIKE '%RLM S. J. RIO PRETO%'
    OR p_descricao ILIKE '%CONVENIO RLM S. J. RIO PRETO%'
    OR p_descricao ILIKE '%CONVENIO - RLM SAO JOSE DO RIO PRETO%' THEN 'RLM SAO JOSE DO RIO PRETO'
  WHEN p_descricao ILIKE '%LUCY MONTORO DIADEMA%'
    OR p_descricao ILIKE '%CUSTEIO PARA ATENDER LUCY MONTORO DIADEMA%'
    OR (p_descricao ILIKE '%RLM%' AND p_descricao ILIKE '%DIADEMA%') THEN 'RLM DIADEMA'
  WHEN p_descricao ILIKE '%RLM TAUBATE%'
    OR p_descricao ILIKE '%CONTRATO DE GESTAO RLM TAUBATE%'
    OR p_descricao ILIKE '%LUCY MONTORO TAUBATE%' THEN 'RLM TAUBATE'
  WHEN p_descricao ILIKE '%RLM BOTUCATU%'
    OR p_descricao ILIKE '%CONTRATO DE GESTAO RLM BOTUCATU%'
    OR p_descricao ILIKE '%LUCY MONTORO BOTUCATU%' THEN 'RLM BOTUCATU'
  WHEN p_descricao ILIKE '%PARIQUERA%' THEN 'RLM PARIQUERA ACÚ'
  WHEN p_descricao ILIKE '%RLM SOROCABA%'
    OR p_descricao ILIKE '%CONTRATO DE GESTAO - RLM SOROCABA%'
    OR p_descricao ILIKE '%LUCY MONTORO SOROCABA%' THEN 'RLM SOROCABA'
  WHEN p_descricao ILIKE '%RLM PRESIDENTE PRUDENTE%'
    OR p_descricao ILIKE '%CONTRATO GESTAO RLM PRESIDENTE PRUDENTE%'
    OR (p_descricao ILIKE '%RLM%'
      AND (p_descricao ILIKE '%PRESIDENTE PRUDENTE%'
        OR p_descricao ILIKE '%PRES. PRUDENTE%')) THEN 'RLM PRESIDENTE PRUDENTE'
  WHEN p_descricao ILIKE '%RLM SANTOS%'
    OR p_descricao ILIKE '%CONTRATO GESTAO RLM SANTOS%'
    OR p_descricao ILIKE '%LUCY MONTORO SANTOS%' THEN 'RLM SANTOS'
  WHEN (p_descricao ILIKE '%RLM%' AND p_descricao ILIKE '%MARILIA%')
    OR p_descricao ILIKE '%LUCY MONTORO MARILIA%' THEN 'RLM MARILIA'
  WHEN (p_descricao ILIKE '%RLM%' AND p_descricao ILIKE '%CAMPINAS%')
    OR p_descricao ILIKE '%LUCY MONTORO CAMPINAS%' THEN 'RLM CAMPINAS'
  WHEN p_descricao ILIKE '%CONTRATO GESTAO P/ ATENDER INST. LUCY MONTORO%' THEN 'REDE LUCY MONTORO'
  WHEN p_descricao ILIKE '%RLM%'
    OR p_descricao ILIKE '%REDE LUCY MONTORO%'
    OR p_descricao ILIKE '%LUCY MONTORO%'
    OR p_descricao ILIKE '%INST. REAB. LUCY%' THEN 'REDE LUCY MONTORO'
  WHEN p_descricao ILIKE '%HCFAMEMA%'
    OR p_descricao ILIKE '%FAMEMA%' THEN 'HCFAMEMA'
  WHEN p_descricao ILIKE '%NAOR BOTUCATU%'
    OR p_descricao ILIKE '%HCBOTUCATU%' THEN 'HCBOTUCATU'
  WHEN p_descricao ILIKE '%HCSP%'
    OR p_descricao ILIKE '%HC SAO PAULO%'
    OR p_descricao ILIKE '%HC DE SAO PAULO%' THEN 'HCSP'
  WHEN p_descricao ILIKE '%HCRIBEIRAO%'
    OR p_descricao ILIKE '%HC RIBEIRAO%'
    OR p_descricao ILIKE '%HCFMRP%' THEN 'HCRIBEIRÃO'
  WHEN p_descricao ILIKE '%HEMOCENTRO%' THEN 'AUTARQUIA - HEMOCENTRO'
  WHEN p_descricao ILIKE '%FURP%' THEN 'AUTARQUIA - FURP'
  WHEN p_descricao ILIKE '%ONCOCENT%' THEN 'AUTARQUIA - ONCOCENTRO'
  WHEN p_descricao ILIKE '%GESTAO ESTADUAL%'
    OR p_descricao ILIKE '%GESTÃO ESTADUAL%'
    OR p_descricao ILIKE '%GESTAO PLENA%' THEN 'GESTÃO ESTADUAL'
  WHEN p_descricao ILIKE '%CONVENIO%'
    OR p_descricao ILIKE '%CONVÊNIO%'
    OR p_descricao ILIKE '%CONVENÇÃO%' THEN 'CONVÊNIO'
  WHEN p_descricao ILIKE '%EMENDA PARLAMENTAR%'
    OR p_descricao ILIKE '%EMENDAS PARLAMENTARES%'
    OR p_descricao ILIKE '%EMENDA PARL%'
    OR p_descricao ILIKE '%EMENDAS IMPOSITIVAS%'
    OR p_descricao ILIKE '%EMENDA IMPOSITIVA%'
    OR p_descricao ILIKE '%TA EMENDA%'
    OR p_descricao ILIKE '%CUSTEIO EMENDA%'
    OR p_descricao ILIKE '%INVESTIMENTO EMENDA%'
    OR p_descricao ILIKE '%TERMO DE ADITAMENTO EMENDA%'
    OR p_descricao ILIKE '%SAUDE HUMANA CUSTEIO%'
    OR p_descricao ILIKE '%RESOLUCAO SS 50%'
    OR p_descricao ILIKE '%HC - UNICAMP%' THEN 'EMENDA'
  WHEN p_descricao ILIKE '%PEROLA BYINGTON%'
    OR p_descricao ILIKE '%PPP DESEQUILIBRIO%' THEN 'PPP'
  WHEN p_descricao ILIKE '%CORUJAO%'
    OR p_descricao ILIKE '%CIRURGIA ELETIVA%'
    OR p_descricao ILIKE '%MUTIRAO CIRURGIA%'
    OR p_descricao ILIKE '%PAGAMENTO DE CIRURGIAS ELETIVAS%'
    OR p_descricao ILIKE '%CUSTEIO / CORUJAO%' THEN 'CIRURGIAS ELETIVAS'
  WHEN p_descricao ILIKE '%PISO ENFERM%'
    OR p_descricao ILIKE '%PISO DA ENFERM%'
    OR p_descricao ILIKE '%REAJUSTE PISO%'
    OR p_descricao ILIKE '%PAGAMENTO PISO ENFERMAGEM%'
    OR p_descricao ILIKE '%PISO SALARIAL DA ENFERMAGEM%'
    OR p_descricao ILIKE '%RESOLUCAO SS 124%'
    OR p_descricao ILIKE '%RESOLUCAO SS N. 124%' THEN 'PISO ENFERMAGEM'
  WHEN p_descricao ILIKE '%CASAS DE APOIO%' THEN 'CASAS DE APOIO'
  WHEN p_descricao ILIKE '%AEDES AEGYPTI%' THEN 'AEDES AEGYPTI'
  WHEN p_descricao ILIKE '%SISTEMA PRISIONAL%' THEN 'SISTEMA PRISIONAL'
  WHEN (p_descricao ILIKE '%ACAO CIVIL%' OR p_descricao ILIKE '%AÇÃO CIVIL%')
    AND p_descricao ILIKE '%BAURU%' THEN 'AÇÃO CIVIL - BAURU'
  WHEN p_descricao ILIKE '%DOSE CERTA%' THEN 'DOSE CERTA'
  WHEN p_descricao ILIKE '%GLICEMIA%' THEN 'GLICEMIA'
  WHEN p_descricao ILIKE '%QUALIS MAIS%' THEN 'QUALIS MAIS'
  WHEN p_descricao ILIKE '%ATENCAO BASICA%'
    OR p_descricao ILIKE '%ATENÇÃO BÁSICA%'
    OR p_descricao ILIKE '%ATENÇÃO BASICA%' THEN 'ATENÇÃO BÁSICA'
  WHEN p_descricao ILIKE '%SORRIA SP%' THEN 'SORRIA SP'
  WHEN p_descricao ILIKE '%IGM SUS PAULISTA%' THEN 'IGM SUS PAULISTA'
  WHEN p_descricao ILIKE '%TABELA SUS%'
    OR p_descricao ILIKE '%TABELASUS%'
    OR p_descricao ILIKE '%RESOLUCAO SS 164%'
    OR p_descricao ILIKE '%RESOLUCAO SS N. 164%'
    OR p_descricao ILIKE '%RESOLUCAO SS N. 198%' THEN 'TABELA SUS PAULISTA'
  WHEN p_descricao ILIKE '%REPELENTE%' THEN 'REPELENTE'
  WHEN p_descricao ILIKE '% TEA'
    OR p_descricao ILIKE '%-TEA%'
    OR p_descricao ILIKE '%- TEA%'
    OR p_descricao ILIKE '%TEA %'
    OR p_descricao ILIKE '%TRATAMENTO TEA%'
    OR p_descricao ILIKE '%AUTISTA%'
    OR p_descricao ILIKE '%AMA-ASSOCIACAO%'
    OR p_descricao ILIKE '%ATENDIMENTO DE PACIENTES AUTISTA%'
    OR p_descricao ILIKE '%ASSOCIACAO DE AMIGOS DO AUTISTA%' THEN 'TEA'
  ELSE p_tipo
END
$$;

GRANT EXECUTE ON FUNCTION public.classify_tipo_despesa(text, text) TO anon, authenticated;

ALTER TABLE public.lc131_despesas
  DROP COLUMN IF EXISTS tipo_despesa_classif;

ALTER TABLE public.lc131_despesas
  ADD COLUMN tipo_despesa_classif text;

CREATE OR REPLACE FUNCTION public.set_tipo_despesa_classif()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.tipo_despesa_classif := public.classify_tipo_despesa(NEW.descricao_processo, NEW.tipo_despesa);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_tipo_despesa_classif ON public.lc131_despesas;

CREATE TRIGGER trg_set_tipo_despesa_classif
BEFORE INSERT OR UPDATE OF descricao_processo, tipo_despesa
ON public.lc131_despesas
FOR EACH ROW
EXECUTE FUNCTION public.set_tipo_despesa_classif();

CREATE OR REPLACE FUNCTION public.refresh_tipo_despesa_classif_batch(
  p_batch_size integer DEFAULT 5000
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer;
BEGIN
  WITH targets AS (
    SELECT d.id
    FROM public.lc131_despesas AS d
    WHERE d.tipo_despesa_classif IS DISTINCT FROM public.classify_tipo_despesa(d.descricao_processo, d.tipo_despesa)
    ORDER BY d.id
    LIMIT GREATEST(COALESCE(p_batch_size, 5000), 1)
  ), updated AS (
    UPDATE public.lc131_despesas AS d
       SET tipo_despesa_classif = public.classify_tipo_despesa(d.descricao_processo, d.tipo_despesa)
      FROM targets
     WHERE d.id = targets.id
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_rows FROM updated;

  RETURN COALESCE(v_rows, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_tipo_despesa_classif_batch(integer) TO anon, authenticated;

ANALYZE public.lc131_despesas;

NOTIFY pgrst, 'reload schema';