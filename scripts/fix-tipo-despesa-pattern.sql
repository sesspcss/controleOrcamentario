-- ================================================================
-- fix_tipo_despesa_by_pattern()  — versão 2.0 (all-years)
-- Reclassifica tipo_despesa usando TODAS as colunas relevantes.
-- Usa ctid trick (evita avaliar CASE duas vezes).
--
-- Nota: prefira fix_tipo_despesa_by_year(ano) para execuções
-- parciais sem timeout. Esta versão processa todos os anos de uma vez.
-- Execute no Supabase SQL Editor.
-- ================================================================

-- Garante que norm_tipo_desc existe
CREATE OR REPLACE FUNCTION public.norm_tipo_desc(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT upper(trim(regexp_replace(
    translate(p,
      'áàãâäéèêëíìîïóòõôöúùûüçÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ',
      'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'),
    '\s+', ' ', 'g')))
$$;

-- ================================================================
-- Função principal: reclassifica tipo_despesa — todos os anos
-- ================================================================
DROP FUNCTION IF EXISTS public.fix_tipo_despesa_by_pattern();

CREATE FUNCTION public.fix_tipo_despesa_by_pattern()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = 0
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.lc131_despesas d
  SET tipo_despesa = m.novo_tipo
  FROM (
    SELECT ctid,
      CASE

        -- ══════════════════════════════════════════════════════════
        -- BLOCO 1 — RLM (unidades específicas)
        -- ══════════════════════════════════════════════════════════
        WHEN norm_tipo_desc(descricao_processo) LIKE '%RLM FERNANDOPOLIS%'
          OR norm_tipo_desc(codigo_nome_ug)      LIKE '%RLM FERNANDOPOLIS%'   THEN 'RLM FERNANDÓPOLIS'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%RLM MOGI MIRIM%'
          OR norm_tipo_desc(codigo_nome_ug)      LIKE '%RLM MOGI MIRIM%'      THEN 'RLM MOGI MIRIM'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%RLM S%J%RIO PRETO%'
          OR norm_tipo_desc(descricao_processo) LIKE '%RLM SAO JOSE DO RIO PRETO%'
          OR norm_tipo_desc(codigo_nome_ug)      LIKE '%RLM%SAO JOSE DO RIO PRETO%' THEN 'RLM SAO JOSE DO RIO PRETO'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%RLM DIADEMA%'
          OR norm_tipo_desc(codigo_nome_ug)      LIKE '%RLM DIADEMA%'         THEN 'RLM DIADEMA'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%RLM TAUBATE%'
          OR norm_tipo_desc(codigo_nome_ug)      LIKE '%RLM TAUBATE%'         THEN 'RLM TAUBATE'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%RLM BOTUCATU%'
          OR norm_tipo_desc(codigo_nome_ug)      LIKE '%RLM BOTUCATU%'        THEN 'RLM BOTUCATU'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%RLM PARIQUERA%'
          OR norm_tipo_desc(codigo_nome_ug)      LIKE '%RLM PARIQUERA%'       THEN 'RLM PARIQUERA ACú'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%RLM SOROCABA%'
          OR norm_tipo_desc(codigo_nome_ug)      LIKE '%RLM SOROCABA%'        THEN 'RLM SOROCABA'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%RLM SAO JOSE DOS CAMPOS%'
          OR norm_tipo_desc(descricao_processo) LIKE '%RLM S%J%CAMPOS%'
          OR norm_tipo_desc(codigo_nome_ug)      LIKE '%RLM%SAO JOSE%CAMPOS%' THEN 'RLM SÃO JOSÉ DOS CAMPOS'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%RLM PRESIDENTE PRUDENTE%'
          OR norm_tipo_desc(codigo_nome_ug)      LIKE '%RLM PRESIDENTE PRUDENTE%' THEN 'RLM PRESIDENTE PRUDENTE'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%RLM SANTOS%'
          OR norm_tipo_desc(codigo_nome_ug)      LIKE '%RLM SANTOS%'          THEN 'RLM SANTOS'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%RLM MARILIA%'
          OR norm_tipo_desc(codigo_nome_ug)      LIKE '%RLM MARILIA%'         THEN 'RLM MARILIA'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%RLM CAMPINAS%'
          OR norm_tipo_desc(codigo_nome_ug)      LIKE '%RLM CAMPINAS%'        THEN 'RLM CAMPINAS'

        -- ══════════════════════════════════════════════════════════
        -- BLOCO 2 — REDE LUCY MONTORO (genérico)
        -- ══════════════════════════════════════════════════════════
        WHEN norm_tipo_desc(descricao_processo)            LIKE '%LUCY MONTORO%'
          OR norm_tipo_desc(codigo_nome_ug)                LIKE '%LUCY MONTORO%'
          OR norm_tipo_desc(codigo_nome_projeto_atividade) LIKE '%LUCY MONTORO%' THEN 'REDE LUCY MONTORO'

        -- ══════════════════════════════════════════════════════════
        -- BLOCO 3 — Autarquias / Hospitais de Ensino
        -- ══════════════════════════════════════════════════════════
        WHEN norm_tipo_desc(descricao_processo)    LIKE '%HEMOCENTRO%'
          OR norm_tipo_desc(codigo_nome_ug)         LIKE '%HEMOCENTRO%'
          OR norm_tipo_desc(codigo_nome_favorecido) LIKE '%HEMOCENTRO%'       THEN 'AUTARQUIA - HEMOCENTRO'

        WHEN norm_tipo_desc(descricao_processo)    LIKE '%FURP%'
          OR norm_tipo_desc(codigo_nome_ug)         LIKE '%FURP%'
          OR norm_tipo_desc(codigo_nome_favorecido) LIKE '%FURP%'             THEN 'AUTARQUIA - FURP'

        WHEN norm_tipo_desc(descricao_processo)    LIKE '%ONCOCENTRO%'
          OR norm_tipo_desc(codigo_nome_ug)         LIKE '%ONCOCENTRO%'
          OR norm_tipo_desc(codigo_nome_favorecido) LIKE '%ONCOCENTRO%'       THEN 'AUTARQUIA - ONCOCENTRO'

        WHEN norm_tipo_desc(descricao_processo)    LIKE '%HCFAMEMA%'
          OR norm_tipo_desc(codigo_nome_ug)         LIKE '%HCFAMEMA%'
          OR norm_tipo_desc(codigo_nome_favorecido) LIKE '%HCFAMEMA%'
          OR norm_tipo_desc(codigo_nome_favorecido) LIKE '%FACULDADE%MEDICINA%MARILIA%' THEN 'HCFAMEMA'

        WHEN norm_tipo_desc(descricao_processo)    LIKE '%HCBOTUCATU%'
          OR norm_tipo_desc(descricao_processo)    LIKE '%HC BOTUCATU%'
          OR norm_tipo_desc(codigo_nome_ug)         LIKE '%HC%BOTUCATU%'
          OR norm_tipo_desc(codigo_nome_favorecido) LIKE '%HC%BOTUCATU%'
          OR (norm_tipo_desc(codigo_nome_favorecido) LIKE '%HOSPITAL DAS CLINICAS%'
              AND norm_tipo_desc(codigo_nome_favorecido) LIKE '%BOTUCATU%')   THEN 'HCBOTUCATU'

        WHEN norm_tipo_desc(descricao_processo)    LIKE '%HCRIBEIRAO%'
          OR norm_tipo_desc(descricao_processo)    LIKE '%HC RIBEIRAO%'
          OR norm_tipo_desc(codigo_nome_ug)         LIKE '%HC%RIBEIRAO%'
          OR norm_tipo_desc(codigo_nome_favorecido) LIKE '%HC%RIBEIRAO%'
          OR (norm_tipo_desc(codigo_nome_favorecido) LIKE '%HOSPITAL DAS CLINICAS%'
              AND norm_tipo_desc(codigo_nome_favorecido) LIKE '%RIBEIRAO%')   THEN 'HCRIBEIRÃO'

        WHEN norm_tipo_desc(descricao_processo)    LIKE '%HCSP%'
          OR norm_tipo_desc(descricao_processo)    LIKE '%HC SAO PAULO%'
          OR norm_tipo_desc(descricao_processo)    LIKE '%HOSPITAL DAS CLINICAS%'
          OR norm_tipo_desc(codigo_nome_ug)         LIKE '%HOSPITAL DAS CLINICAS%'
          OR norm_tipo_desc(codigo_nome_favorecido) LIKE '%HOSPITAL DAS CLINICAS%' THEN 'HCSP'

        -- ══════════════════════════════════════════════════════════
        -- BLOCO 4 — Programas específicos
        -- ══════════════════════════════════════════════════════════
        WHEN norm_tipo_desc(descricao_processo) LIKE '%GLICEMIA%'             THEN 'GLICEMIA'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%DOSE CERTA%'           THEN 'DOSE CERTA'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%CORUJAO%'
          OR norm_tipo_desc(descricao_processo) LIKE '%CIRURGIAS ELETIVAS%'   THEN 'CIRURGIAS ELETIVAS'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%AEDES AEGYPTI%'        THEN 'AEDES AEGYPTI'

        WHEN norm_tipo_desc(descricao_processo) LIKE '%PISO%ATENCAO%BASICA%'
          OR norm_tipo_desc(descricao_processo) LIKE '%PISO DE ATENCAO BASICA%' THEN 'PAB'

        WHEN norm_tipo_desc(descricao_processo) LIKE '%PISO%ENFERMAGEM%'
          OR norm_tipo_desc(descricao_processo) LIKE '%PISO DA ENFERMAGEM%'
          OR norm_tipo_desc(descricao_processo) LIKE '%PISO ENFERMAGEM%'      THEN 'PISO ENFERMAGEM'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%CASAS DE APOIO%'       THEN 'CASAS DE APOIO'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%QUALIS MAIS%'          THEN 'QUALIS MAIS'

        WHEN norm_tipo_desc(descricao_processo) LIKE '%TRANSTORNO%ESPECTRO%AUTISMO%'
          OR norm_tipo_desc(descricao_processo) LIKE '%AUTISMO%'
          OR norm_tipo_desc(descricao_processo) LIKE '% TEA %'
          OR norm_tipo_desc(descricao_processo) LIKE '% TEA'
          OR norm_tipo_desc(descricao_processo) = 'TEA'                       THEN 'TEA'

        WHEN norm_tipo_desc(descricao_processo) LIKE '%IGM SUS PAULISTA%'     THEN 'IGM SUS PAULISTA'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%TABELA SUS PAULISTA%'
          OR norm_tipo_desc(descricao_processo) LIKE '%TABELASUS PAULISTA%'   THEN 'TABELA SUS PAULISTA'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%REPELENTE%'            THEN 'REPELENTE'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%SORRIA SP%'            THEN 'SORRIA SP'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%RESIDENCIA TERAPEUTICA%'
          OR norm_tipo_desc(codigo_nome_projeto_atividade) LIKE '%RESIDENCIA TERAPEUTICA%' THEN 'RESIDÊNCIA TERAPÊUTICA'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%SISTEMA PRISIONAL%'    THEN 'SISTEMA PRISIONAL'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%ACAO CIVIL%BAURU%'     THEN 'AÇÃO CIVIL - BAURU'
        WHEN norm_tipo_desc(descricao_processo)    LIKE '%ICESP%'
          OR norm_tipo_desc(codigo_nome_ug)         LIKE '%ICESP%'
          OR norm_tipo_desc(codigo_nome_favorecido) LIKE '%ICESP%'            THEN 'ORGANIZAÇÃO SOCIAL'

        WHEN norm_tipo_desc(descricao_processo) LIKE '%BATA CINZA%'           THEN 'INTRAORÇAMENTÁRIA - BATA CINZA PPP'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%PPP%'
          OR norm_tipo_desc(descricao_processo) LIKE '%PEROLA BYINGTON%'      THEN 'PPP'

        -- ══════════════════════════════════════════════════════════
        -- BLOCO 5 — Novos programas / tipos
        -- ══════════════════════════════════════════════════════════
        WHEN norm_tipo_desc(descricao_processo) LIKE '%COBERTURA VACINAL%'
          OR norm_tipo_desc(descricao_processo) LIKE '%COBERTURA DE VACINA%'
          OR norm_tipo_desc(codigo_nome_projeto_atividade) LIKE '%COBERTURA VACINAL%' THEN 'COBERTURA VACINAL'

        WHEN norm_tipo_desc(descricao_processo) LIKE '%ARBOVIROSE%'
          OR norm_tipo_desc(codigo_nome_projeto_atividade) LIKE '%ARBOVIROSE%' THEN 'ARBOVIROSE'

        WHEN norm_tipo_desc(descricao_processo) LIKE '%SARAMPO%'
          OR norm_tipo_desc(codigo_nome_projeto_atividade) LIKE '%SARAMPO%'   THEN 'SARAMPO'

        WHEN norm_tipo_desc(descricao_processo) LIKE '%TRANSFERENCIA VOLUNTARIA%'
          OR norm_tipo_desc(descricao_processo) LIKE '%TRANFERENCIA VOLUNTARIA%'
          OR norm_tipo_desc(descricao_processo) LIKE '%TRANSF%VOLUNTARIA%'    THEN 'TRANSFERÊNCIA VOLUNTÁRIA'

        WHEN norm_tipo_desc(descricao_processo) LIKE '%CONTRIBUICAO DE SOLIDARIEDADE%'
          OR norm_tipo_desc(descricao_processo) LIKE '%CONTRIB%SOLIDARIEDADE%' THEN 'CONTRIBUIÇÃO DE SOLIDARIEDADE'

        -- ══════════════════════════════════════════════════════════
        -- BLOCO 6 — Intraorçamentária
        -- ══════════════════════════════════════════════════════════
        WHEN norm_tipo_desc(descricao_processo) LIKE '%INTRAORCAMENTARIA%'
          OR norm_tipo_desc(descricao_processo) LIKE '%INTRA ORCAMENTARIA%'
          OR norm_tipo_desc(descricao_processo) = 'INTRA'                     THEN 'INTRAORÇAMENTÁRIA'

        -- ══════════════════════════════════════════════════════════
        -- BLOCO 7 — TABELA SUS PAULISTA (RESOLUCAO SS — antes de EMENDA)
        -- ══════════════════════════════════════════════════════════
        WHEN norm_tipo_desc(descricao_processo) LIKE '%TETO FIXO FILANTROPICOS%'
          OR norm_tipo_desc(descricao_processo) LIKE '%RESOLUCAO SS N%'
          OR norm_tipo_desc(descricao_processo) LIKE '%RESOLUCAO SS 164%'
          OR norm_tipo_desc(descricao_processo) LIKE '%RESOLUCAO SS 198%'
          OR norm_tipo_desc(descricao_processo) LIKE '%PAGAMENTO RESOLUCAO SS%' THEN 'TABELA SUS PAULISTA'

        -- ══════════════════════════════════════════════════════════
        -- BLOCO 8 — Gestão Estadual
        -- ══════════════════════════════════════════════════════════
        WHEN norm_tipo_desc(descricao_processo) LIKE '%GESTAO ESTADUAL%'      THEN 'GESTÃO ESTADUAL'

        -- ══════════════════════════════════════════════════════════
        -- BLOCO 9 — Fundo a Fundo
        -- ══════════════════════════════════════════════════════════
        WHEN norm_tipo_desc(descricao_processo) LIKE '%FUNDO A FUNDO%EMENDA%'
          OR norm_tipo_desc(descricao_processo) LIKE '%EMENDA%FUNDO A FUNDO%' THEN 'FUNDO A FUNDO - EMENDA'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%FUNDO A FUNDO%DEMANDA%'
          OR norm_tipo_desc(descricao_processo) LIKE '%FUNDO A FUNDO%PARLAMENTAR%' THEN 'FUNDO A FUNDO - DEMANDAS PARLAMENTARES'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%FUNDO A FUNDO PAB%'    THEN 'FUNDO A FUNDO PAB'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%FUNDO A FUNDO%'
          OR norm_tipo_desc(descricao_processo) LIKE '%TRANSFERENCIA%FUNDO%FUNDO%'
          OR norm_tipo_desc(descricao_processo) LIKE '%REPASSE FUNDO%FUNDO%'  THEN 'FUNDO A FUNDO'

        -- ══════════════════════════════════════════════════════════
        -- BLOCO 10 — Emenda
        -- ══════════════════════════════════════════════════════════
        WHEN norm_tipo_desc(descricao_processo) LIKE '%RESOLUCAO SS%'
          OR norm_tipo_desc(descricao_processo) LIKE '%RES. SS%'
          OR norm_tipo_desc(descricao_processo) LIKE '%RES SS%'
          OR norm_tipo_desc(descricao_processo) LIKE '%SAUDE HUMANA%'
          OR norm_tipo_desc(descricao_processo) LIKE '%APAE%'                 THEN 'EMENDA'

        -- ══════════════════════════════════════════════════════════
        -- BLOCO 11 — Outros tipos
        -- ══════════════════════════════════════════════════════════
        WHEN norm_tipo_desc(descricao_processo) LIKE '%ATENCAO BASICA%'
          OR norm_tipo_desc(codigo_nome_projeto_atividade) LIKE '%ATENCAO BASICA%' THEN 'ATENÇÃO BÁSICA'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%EXECUCAO DAS ATIVIDADES%' THEN 'ORGANIZAÇÃO SOCIAL'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%CONVENIO%'             THEN 'CONVÊNIO'
        WHEN norm_tipo_desc(descricao_processo) LIKE '%CONTRATO DE GESTAO%'
          OR norm_tipo_desc(descricao_processo) LIKE '%CONTRATO GESTAO%'      THEN 'CONTRATO GESTÃO'

        -- ══════════════════════════════════════════════════════════
        -- BLOCO 12 — Fallbacks via codigo_nome_projeto_atividade
        -- ══════════════════════════════════════════════════════════
        WHEN norm_tipo_desc(codigo_nome_projeto_atividade) LIKE '%FUNDO A FUNDO%' THEN 'FUNDO A FUNDO'
        WHEN norm_tipo_desc(codigo_nome_projeto_atividade) LIKE '%PISO ATENCAO BASICA%'
          OR norm_tipo_desc(codigo_nome_projeto_atividade) LIKE '%PISO DE ATENCAO BASICA%' THEN 'PAB'
        WHEN norm_tipo_desc(codigo_nome_projeto_atividade) LIKE '%GESTAO ESTADUAL%' THEN 'GESTÃO ESTADUAL'
        WHEN norm_tipo_desc(codigo_nome_projeto_atividade) LIKE '%IGM SUS PAULISTA%' THEN 'IGM SUS PAULISTA'
        WHEN norm_tipo_desc(codigo_nome_projeto_atividade) LIKE '%TABELA SUS PAULISTA%' THEN 'TABELA SUS PAULISTA'
        WHEN norm_tipo_desc(codigo_nome_projeto_atividade) LIKE '%CONVENIO%'  THEN 'CONVÊNIO'
        WHEN norm_tipo_desc(codigo_nome_projeto_atividade) LIKE '%CONTRATO%GESTAO%' THEN 'CONTRATO GESTÃO'

        -- ══════════════════════════════════════════════════════════
        -- BLOCO 13 — Fallback via fonte de recurso + elemento
        -- ══════════════════════════════════════════════════════════
        WHEN (norm_tipo_desc(codigo_nome_fonte_recurso) LIKE '%SUS%'
               OR norm_tipo_desc(codigo_nome_fonte_recurso) LIKE '%FEDERAL%')
          AND norm_tipo_desc(codigo_nome_elemento) LIKE '%TRANSFEREN%MUNICIPIO%' THEN 'FUNDO A FUNDO'

        -- ══════════════════════════════════════════════════════════
        -- BLOCO 14 — Normalização de variantes/typos existentes
        -- ══════════════════════════════════════════════════════════
        WHEN tipo_despesa IN ('TRANFERÊNCIA VOLUNTÁRIA', 'TRANFERENCIA VOLUNTARIA',
                              'TRANF. VOLUNTARIA', 'TRANSFERENCIA VOLUNTARIA')
          THEN 'TRANSFERÊNCIA VOLUNTÁRIA'
        WHEN tipo_despesa IN ('ATENÇÃO BÁSICA', 'ATENCAO BASICA')              THEN 'ATENÇÃO BÁSICA'
        WHEN tipo_despesa IN ('GESTÃO ESTADUAL', 'GESTAO ESTADUAL')            THEN 'GESTÃO ESTADUAL'
        WHEN tipo_despesa IN ('CONVÊNIO', 'CONVENIO')                          THEN 'CONVÊNIO'
        WHEN tipo_despesa IN ('CONTRATO GESTÃO', 'CONTRATO GESTAO',
                              'CONTRATO DE GESTÃO', 'CONTRATO DE GESTAO')      THEN 'CONTRATO GESTÃO'
        WHEN tipo_despesa IN ('RESIDÊNCIA TERAPÊUTICA', 'RESIDENCIA TERAPEUTICA') THEN 'RESIDÊNCIA TERAPÊUTICA'
        WHEN tipo_despesa IN ('ORGANIZAÇÃO SOCIAL', 'ORGANIZACAO SOCIAL')      THEN 'ORGANIZAÇÃO SOCIAL'
        WHEN tipo_despesa IN ('INTRAORÇAMENTÁRIA', 'INTRAORCAMENTARIA')        THEN 'INTRAORÇAMENTÁRIA'
        WHEN tipo_despesa IN ('CIRURGIAS ELETIVAS', 'CIRURGIA ELETIVA')        THEN 'CIRURGIAS ELETIVAS'
        WHEN tipo_despesa IN ('CONTRIBUIÇÃO DE SOLIDARIEDADE',
                              'CONTRIBUICAO DE SOLIDARIEDADE')                 THEN 'CONTRIBUIÇÃO DE SOLIDARIEDADE'

        ELSE tipo_despesa
      END AS novo_tipo
    FROM public.lc131_despesas
  ) m
  WHERE d.ctid = m.ctid
    AND d.tipo_despesa IS DISTINCT FROM m.novo_tipo;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN json_build_object('updated', n);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fix_tipo_despesa_by_pattern() TO anon, authenticated;

SELECT 'Função fix_tipo_despesa_by_pattern v2 criada com sucesso' AS status;
