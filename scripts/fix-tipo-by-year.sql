-- ================================================================
-- fix_tipo_despesa_by_year(p_ano INT)
-- Mesmo mapeamento de fix_tipo_despesa_by_pattern, mas processa
-- apenas um ano por vez. Permite chamadas rápidas (<30s cada).
-- Execute no Supabase SQL Editor, depois rode: node scripts/run-fix-tipo-year.mjs
-- ================================================================

CREATE OR REPLACE FUNCTION public.fix_tipo_despesa_by_year(p_ano INT)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = 0
AS $$
DECLARE
  n INTEGER;
BEGIN
  UPDATE public.lc131_despesas d
  SET tipo_despesa = m.novo_tipo
  FROM (
    SELECT ctid,
      CASE
        -- ─── RLM ────────────────────────────────────────────────────
        WHEN norm_tipo_desc(descricao_processo) LIKE '%RLM FERNANDOPOLIS%'    THEN 'RLM FERNANDÓPOLIS'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%RLM MOGI MIRIM%'       THEN 'RLM MOGI MIRIM'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%RLM S%J%RIO PRETO%'
          OR norm_tipo_desc(descricao_processo) LIKE '%RLM SAO JOSE DO RIO PRETO%' THEN 'RLM SAO JOSE DO RIO PRETO'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%RLM DIADEMA%'          THEN 'RLM DIADEMA'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%RLM TAUBATE%'          THEN 'RLM TAUBATE'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%RLM BOTUCATU%'         THEN 'RLM BOTUCATU'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%RLM PARIQUERA%'        THEN 'RLM PARIQUERA ACú'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%RLM SOROCABA%'         THEN 'RLM SOROCABA'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%RLM SAO JOSE DOS CAMPOS%'
          OR norm_tipo_desc(descricao_processo) LIKE '%RLM S%J%CAMPOS%'       THEN 'RLM SÃO JOSÉ DOS CAMPOS'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%RLM PRESIDENTE PRUDENTE%' THEN 'RLM PRESIDENTE PRUDENTE'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%RLM SANTOS%'           THEN 'RLM SANTOS'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%RLM MARILIA%'          THEN 'RLM MARILIA'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%RLM CAMPINAS%'         THEN 'RLM CAMPINAS'

        -- ─── LUCY MONTORO genérico ──────────────────────────────────
        WHEN norm_tipo_desc(descricao_processo) LIKE '%LUCY MONTORO%'         THEN 'REDE LUCY MONTORO'

        -- ─── Autarquias / Hospitais ─────────────────────────────────
        WHEN norm_tipo_desc(descricao_processo) LIKE '%HEMOCENTRO%'           THEN 'AUTARQUIA - HEMOCENTRO'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%FURP%'                 THEN 'AUTARQUIA - FURP'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%ONCOCENTRO%'           THEN 'AUTARQUIA - ONCOCENTRO'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%HCFAMEMA%'             THEN 'HCFAMEMA'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%HCBOTUCATU%'
          OR norm_tipo_desc(descricao_processo) LIKE '%HC BOTUCATU%'          THEN 'HCBOTUCATU'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%HCRIBEIRAO%'
          OR norm_tipo_desc(descricao_processo) LIKE '%HC RIBEIRAO%'          THEN 'HCRIBEIRÃO'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%HCSP%'
          OR norm_tipo_desc(descricao_processo) LIKE '%HC SAO PAULO%'
          OR norm_tipo_desc(descricao_processo) LIKE '%HOSPITAL DAS CLINICAS%' THEN 'HCSP'

        -- ─── Programas específicos ──────────────────────────────────
        WHEN norm_tipo_desc(descricao_processo) LIKE '%GLICEMIA%'             THEN 'GLICEMIA'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%DOSE CERTA%'           THEN 'DOSE CERTA'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%CORUJAO%'
          OR norm_tipo_desc(descricao_processo) LIKE '%CIRURGIAS ELETIVAS%'   THEN 'CIRURGIAS ELETIVAS'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%AEDES AEGYPTI%'        THEN 'AEDES AEGYPTI'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%PISO%ENFERMAGEM%'
          OR norm_tipo_desc(descricao_processo) LIKE '%PISO DA ENFERMAGEM%'
          OR norm_tipo_desc(descricao_processo) LIKE '%PISO ENFERMAGEM%'      THEN 'PISO ENFERMAGEM'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%CASAS DE APOIO%'       THEN 'CASAS DE APOIO'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%QUALIS MAIS%'          THEN 'QUALIS MAIS'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%TEA%'                  THEN 'TEA'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%IGM SUS PAULISTA%'     THEN 'IGM SUS PAULISTA'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%TABELA SUS PAULISTA%'
          OR norm_tipo_desc(descricao_processo) LIKE '%TABELASUS PAULISTA%'   THEN 'TABELA SUS PAULISTA'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%REPELENTE%'            THEN 'REPELENTE'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%SORRIA SP%'            THEN 'SORRIA SP'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%RESIDENCIA TERAPEUTICA%' THEN 'RESIDÊNCIA TERAPÊUTICA'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%SISTEMA PRISIONAL%'    THEN 'SISTEMA PRISIONAL'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%ACAO CIVIL%BAURU%'     THEN 'AÇÃO CIVIL - BAURU'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%ICESP%'                THEN 'ORGANIZAÇÃO SOCIAL'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%PPP%'
          OR norm_tipo_desc(descricao_processo) LIKE '%PEROLA BYINGTON%'      THEN 'PPP'

        -- ─── Intraorçamentária ──────────────────────────────────────
        WHEN norm_tipo_desc(descricao_processo) LIKE '%BATA CINZA%'           THEN 'INTRAORÇAMENTÁRIA - BATA CINZA PPP'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%INTRAORCAMENTARIA%'
          OR norm_tipo_desc(descricao_processo) LIKE '%INTRA ORCAMENTARIA%'
          OR norm_tipo_desc(descricao_processo) = 'INTRA'                     THEN 'INTRAORÇAMENTÁRIA'

        -- ─── Gestão Estadual ────────────────────────────────────────
        WHEN norm_tipo_desc(descricao_processo) LIKE '%GESTAO ESTADUAL%'      THEN 'GESTÃO ESTADUAL'

        -- ─── Fundo a Fundo ──────────────────────────────────────────
        WHEN norm_tipo_desc(descricao_processo) LIKE '%FUNDO A FUNDO%EMENDA%'
          OR norm_tipo_desc(descricao_processo) LIKE '%EMENDA%FUNDO A FUNDO%' THEN 'FUNDO A FUNDO - EMENDA'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%FUNDO A FUNDO%DEMANDA%'
          OR norm_tipo_desc(descricao_processo) LIKE '%FUNDO A FUNDO%PARLAMENTAR%' THEN 'FUNDO A FUNDO - DEMANDAS PARLAMENTARES'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%FUNDO A FUNDO PAB%'    THEN 'FUNDO A FUNDO PAB'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%FUNDO A FUNDO%'
          OR norm_tipo_desc(descricao_processo) LIKE '%TRANSFERENCIA%FUNDO%FUNDO%'
          OR norm_tipo_desc(descricao_processo) LIKE '%REPASSE FUNDO%FUNDO%'  THEN 'FUNDO A FUNDO'

        -- ─── Emenda ─────────────────────────────────────────────────
        WHEN norm_tipo_desc(descricao_processo) LIKE '%RESOLUCAO SS%'
          OR norm_tipo_desc(descricao_processo) LIKE '%RES SS%'
          OR norm_tipo_desc(descricao_processo) LIKE '%SAUDE HUMANA%'
          OR norm_tipo_desc(descricao_processo) LIKE '%APAE%'                 THEN 'EMENDA'

        -- ─── Atenção Básica ─────────────────────────────────────────
        WHEN norm_tipo_desc(descricao_processo) LIKE '%ATENCAO BASICA%'       THEN 'ATENÇÃO BÁSICA'

        -- ─── Organização Social ─────────────────────────────────────
        WHEN norm_tipo_desc(descricao_processo) LIKE '%EXECUCAO DAS ATIVIDADES%' THEN 'ORGANIZAÇÃO SOCIAL'

        -- ─── Convênio ───────────────────────────────────────────────
        WHEN norm_tipo_desc(descricao_processo) LIKE '%CONVENIO%'             THEN 'CONVÊNIO'

        -- ─── Contrato de Gestão ─────────────────────────────────────
        WHEN norm_tipo_desc(descricao_processo) LIKE '%CONTRATO DE GESTAO%'
          OR norm_tipo_desc(descricao_processo) LIKE '%CONTRATO GESTAO%'      THEN 'CONTRATO GESTÃO'

        ELSE tipo_despesa
      END AS novo_tipo
    FROM public.lc131_despesas
    WHERE ano = p_ano
  ) m
  WHERE d.ctid = m.ctid
    AND d.tipo_despesa IS DISTINCT FROM m.novo_tipo;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN json_build_object('updated', n, 'ano', p_ano);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fix_tipo_despesa_by_year(INT) TO anon, authenticated;

SELECT 'Função fix_tipo_despesa_by_year criada' AS status;
