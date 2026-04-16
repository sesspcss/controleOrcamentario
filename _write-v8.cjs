const fs = require('fs');

const sql = `-- ================================================================
-- fix_tipo_despesa_by_year(p_ano INT)  — versão 8.0
-- Estratégia em 4 camadas:
--   L1: (ug + desc + proj) exato → bd_ref_tipo
--   L2: (ug + desc) somente quando tipo é ÚNICO nessa combinação
--   L3: (ug + proj) somente quando tipo é ÚNICO nessa combinação
--   Fallback: padrões textuais (semântica do processo/projeto)
--   Final: mantém valor existente
-- SEM L4 (UG sozinha é ambígua — causa classificação errada em massa)
-- ================================================================

-- ─ 0. Corrige trg_enrich_lc131 (remove referências à public.bd_ref dropada) ──
-- bd_ref foi substituída por bd_ref_tipo; o trigger não deve mais consultá-la.
CREATE OR REPLACE FUNCTION public.trg_enrich_lc131()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $trg$
DECLARE
  v_tm  public.tab_municipios%ROWTYPE;
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

  -- Aplicar enriquecimento de tab_municipios (nunca sobrescreve valor existente)
  IF v_tm IS NOT NULL THEN
    NEW.drs       := COALESCE(NULLIF(TRIM(NEW.drs),''),       v_tm.drs);
    NEW.rras      := COALESCE(NULLIF(TRIM(NEW.rras),''),      v_tm.rras);
    NEW.regiao_ad := COALESCE(NULLIF(TRIM(NEW.regiao_ad),''), v_tm.regiao_ad);
    NEW.regiao_sa := COALESCE(NULLIF(TRIM(NEW.regiao_sa),''), v_tm.regiao_sa);
    NEW.cod_ibge  := COALESCE(NULLIF(TRIM(NEW.cod_ibge),''),  v_tm.cod_ibge);
    NEW.municipio := COALESCE(NULLIF(TRIM(NEW.municipio),''), v_tm.municipio_orig, v_tm.municipio);
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
$trg$;

-- ─ 1. Dropa objetos anteriores ────────────────────────────────────
DROP TABLE    IF EXISTS public.bd_ref              CASCADE;
DROP FUNCTION IF EXISTS public.fix_tipo_despesa_by_year(INT);
DROP FUNCTION IF EXISTS public.fix_tipo_despesa_by_year(INT, BIGINT, BIGINT);
DROP FUNCTION IF EXISTS public.lookup_tipo_bdref(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT);
DROP FUNCTION IF EXISTS public.refresh_bdref_lookup();
DROP FUNCTION IF EXISTS public.norm_tipo_desc(TEXT);
DROP TABLE    IF EXISTS public.bd_ref_lookup_full  CASCADE;
DROP TABLE    IF EXISTS public.bd_ref_lookup_desc  CASCADE;
DROP TABLE    IF EXISTS public.bd_ref_lookup_proj  CASCADE;
DROP TABLE    IF EXISTS public.bd_ref_lookup_l1    CASCADE;
DROP TABLE    IF EXISTS public.bd_ref_lookup_l2    CASCADE;
DROP TABLE    IF EXISTS public.bd_ref_lookup_l3    CASCADE;
DROP TABLE    IF EXISTS public.bd_ref_lookup_l4    CASCADE;

-- ─ 2. Função auxiliar de normalização de texto ───────────────────
-- Usada nos padrões textuais: remove acentos, upper, trim
CREATE OR REPLACE FUNCTION public.norm_tipo_desc(txt TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT SET search_path = public AS $$
  SELECT upper(trim(regexp_replace(
    translate(
      coalesce(txt, ''),
      'áàãâäéèêëíìîïóòõôöúùûüçñÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ',
      'aaaaaaeeeeiiiiooooouuuuucnAAAAAAAAEEEEIIIIOOOOOUUUUCN'
    ),
    '\\s+', ' ', 'g'
  )));
$$;
GRANT EXECUTE ON FUNCTION public.norm_tipo_desc(TEXT) TO anon, authenticated;

-- ─ 3. Tabelas de lookup ───────────────────────────────────────────

-- L1: (ug + desc + proj) — match exato, tipo majoritário
CREATE TABLE public.bd_ref_lookup_l1 (
  codigo_nome_ug                TEXT NOT NULL,
  descricao_processo            TEXT NOT NULL,
  codigo_nome_projeto_atividade TEXT NOT NULL,
  tipo_despesa                  TEXT NOT NULL,
  PRIMARY KEY (codigo_nome_ug, descricao_processo, codigo_nome_projeto_atividade)
);

-- L2: (ug + desc) — somente quando tipo é ÚNICO (sem ambiguidade)
CREATE TABLE public.bd_ref_lookup_l2 (
  codigo_nome_ug     TEXT NOT NULL,
  descricao_processo TEXT NOT NULL,
  tipo_despesa       TEXT NOT NULL,
  PRIMARY KEY (codigo_nome_ug, descricao_processo)
);

-- L3: (ug + proj) — somente quando tipo é ÚNICO (sem ambiguidade)
CREATE TABLE public.bd_ref_lookup_l3 (
  codigo_nome_ug                TEXT NOT NULL,
  codigo_nome_projeto_atividade TEXT NOT NULL,
  tipo_despesa                  TEXT NOT NULL,
  PRIMARY KEY (codigo_nome_ug, codigo_nome_projeto_atividade)
);

-- ─ 4. Índices em lc131_despesas ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lc131_ano_id
  ON public.lc131_despesas (ano_referencia, id);

CREATE INDEX IF NOT EXISTS idx_lc131_ug_desc_proj
  ON public.lc131_despesas (codigo_nome_ug, descricao_processo, codigo_nome_projeto_atividade);

-- ─ 5. refresh_bdref_lookup() ─────────────────────────────────────
CREATE FUNCTION public.refresh_bdref_lookup()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n1 INT; n2 INT; n3 INT;
BEGIN
  -- L1: tipo mais frequente por (ug + desc + proj) — sempre inclui
  TRUNCATE TABLE public.bd_ref_lookup_l1;
  INSERT INTO public.bd_ref_lookup_l1
    (codigo_nome_ug, descricao_processo, codigo_nome_projeto_atividade, tipo_despesa)
  SELECT DISTINCT ON (codigo_nome_ug, descricao_processo, codigo_nome_projeto_atividade)
    codigo_nome_ug, descricao_processo, codigo_nome_projeto_atividade, tipo_despesa
  FROM (
    SELECT codigo_nome_ug, descricao_processo, codigo_nome_projeto_atividade,
           tipo_despesa, count(*) AS cnt
    FROM   bd_ref_tipo
    WHERE  codigo_nome_ug IS NOT NULL
      AND  descricao_processo IS NOT NULL
      AND  codigo_nome_projeto_atividade IS NOT NULL
      AND  tipo_despesa IS NOT NULL
    GROUP BY codigo_nome_ug, descricao_processo, codigo_nome_projeto_atividade, tipo_despesa
  ) g
  ORDER BY codigo_nome_ug, descricao_processo, codigo_nome_projeto_atividade,
           cnt DESC, tipo_despesa;
  GET DIAGNOSTICS n1 = ROW_COUNT;

  -- L2: (ug + desc) mas SÓ quando existe tipo ÚNICO para essa combinação
  TRUNCATE TABLE public.bd_ref_lookup_l2;
  INSERT INTO public.bd_ref_lookup_l2 (codigo_nome_ug, descricao_processo, tipo_despesa)
  SELECT codigo_nome_ug, descricao_processo, MAX(tipo_despesa)
  FROM bd_ref_tipo
  WHERE  codigo_nome_ug IS NOT NULL
    AND  descricao_processo IS NOT NULL
    AND  tipo_despesa IS NOT NULL
  GROUP BY codigo_nome_ug, descricao_processo
  HAVING COUNT(DISTINCT tipo_despesa) = 1;
  GET DIAGNOSTICS n2 = ROW_COUNT;

  -- L3: (ug + proj) mas SÓ quando existe tipo ÚNICO para essa combinação
  TRUNCATE TABLE public.bd_ref_lookup_l3;
  INSERT INTO public.bd_ref_lookup_l3 (codigo_nome_ug, codigo_nome_projeto_atividade, tipo_despesa)
  SELECT codigo_nome_ug, codigo_nome_projeto_atividade, MAX(tipo_despesa)
  FROM bd_ref_tipo
  WHERE  codigo_nome_ug IS NOT NULL
    AND  codigo_nome_projeto_atividade IS NOT NULL
    AND  tipo_despesa IS NOT NULL
  GROUP BY codigo_nome_ug, codigo_nome_projeto_atividade
  HAVING COUNT(DISTINCT tipo_despesa) = 1;
  GET DIAGNOSTICS n3 = ROW_COUNT;

  ANALYZE public.bd_ref_lookup_l1;
  ANALYZE public.bd_ref_lookup_l2;
  ANALYZE public.bd_ref_lookup_l3;

  RETURN json_build_object(
    'l1_ug_desc_proj',  n1,
    'l2_ug_desc_unico', n2,
    'l3_ug_proj_unico', n3
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_bdref_lookup() TO anon, authenticated;

-- Popula os lookups imediatamente
SELECT public.refresh_bdref_lookup() AS lookup_stats;

-- ─ 6. fix_tipo_despesa_by_year() ──────────────────────────────────
CREATE FUNCTION public.fix_tipo_despesa_by_year(
  p_ano     INT,
  p_id_min  BIGINT DEFAULT NULL,
  p_id_max  BIGINT DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
SET statement_timeout = 0
AS $$
DECLARE n INTEGER;
BEGIN
  UPDATE public.lc131_despesas d
  SET tipo_despesa = src.novo_tipo
  FROM (
    SELECT lc.ctid,
      COALESCE(
        -- Camada 1: match exato (ug + desc + proj) em bd_ref_tipo
        r1.tipo_despesa,
        -- Camada 2: (ug + desc) somente se tipo é único
        r2.tipo_despesa,
        -- Camada 3: (ug + proj) somente se tipo é único
        r3.tipo_despesa,
        -- Camada 4: padrões textuais (fallback semântico) ──────────
        CASE
          -- ── RLM (Rede Lucy Montoro — unidades específicas) ──────
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%RLM FERNANDOPOLIS%'
            OR norm_tipo_desc(lc.codigo_nome_ug)     LIKE '%RLM FERNANDOPOLIS%'   THEN 'RLM FERNANDÓPOLIS'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%RLM MOGI MIRIM%'
            OR norm_tipo_desc(lc.codigo_nome_ug)     LIKE '%RLM MOGI MIRIM%'      THEN 'RLM MOGI MIRIM'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%RLM%SAO JOSE DO RIO PRETO%'
            OR norm_tipo_desc(lc.codigo_nome_ug)     LIKE '%RLM%SAO JOSE DO RIO PRETO%' THEN 'RLM SAO JOSE DO RIO PRETO'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%RLM DIADEMA%'
            OR norm_tipo_desc(lc.codigo_nome_ug)     LIKE '%RLM DIADEMA%'         THEN 'RLM DIADEMA'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%RLM TAUBATE%'
            OR norm_tipo_desc(lc.codigo_nome_ug)     LIKE '%RLM TAUBATE%'         THEN 'RLM TAUBATE'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%RLM BOTUCATU%'
            OR norm_tipo_desc(lc.codigo_nome_ug)     LIKE '%RLM BOTUCATU%'        THEN 'RLM BOTUCATU'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%RLM PARIQUERA%'
            OR norm_tipo_desc(lc.codigo_nome_ug)     LIKE '%RLM PARIQUERA%'       THEN 'RLM PARIQUERA ACÚ'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%RLM SOROCABA%'
            OR norm_tipo_desc(lc.codigo_nome_ug)     LIKE '%RLM SOROCABA%'        THEN 'RLM SOROCABA'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%RLM%SAO JOSE%CAMPOS%'
            OR norm_tipo_desc(lc.codigo_nome_ug)     LIKE '%RLM%SAO JOSE%CAMPOS%' THEN 'RLM SÃO JOSÉ DOS CAMPOS'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%RLM PRESIDENTE PRUDENTE%'
            OR norm_tipo_desc(lc.codigo_nome_ug)     LIKE '%RLM PRESIDENTE PRUDENTE%' THEN 'RLM PRESIDENTE PRUDENTE'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%RLM SANTOS%'
            OR norm_tipo_desc(lc.codigo_nome_ug)     LIKE '%RLM SANTOS%'          THEN 'RLM SANTOS'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%RLM MARILIA%'
            OR norm_tipo_desc(lc.codigo_nome_ug)     LIKE '%RLM MARILIA%'         THEN 'RLM MARILIA'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%RLM CAMPINAS%'
            OR norm_tipo_desc(lc.codigo_nome_ug)     LIKE '%RLM CAMPINAS%'        THEN 'RLM CAMPINAS'
          -- ── Rede Lucy Montoro genérico ───────────────────────────
          WHEN norm_tipo_desc(lc.descricao_processo)            LIKE '%LUCY MONTORO%'
            OR norm_tipo_desc(lc.codigo_nome_ug)                LIKE '%LUCY MONTORO%'
            OR norm_tipo_desc(lc.codigo_nome_projeto_atividade) LIKE '%LUCY MONTORO%' THEN 'REDE LUCY MONTORO'
          -- ── Autarquias / Hospitais de Ensino ────────────────────
          WHEN norm_tipo_desc(lc.descricao_processo)    LIKE '%HEMOCENTRO%'
            OR norm_tipo_desc(lc.codigo_nome_ug)        LIKE '%HEMOCENTRO%'
            OR norm_tipo_desc(lc.codigo_nome_favorecido) LIKE '%HEMOCENTRO%'      THEN 'AUTARQUIA - HEMOCENTRO'
          WHEN norm_tipo_desc(lc.descricao_processo)    LIKE '%FURP%'
            OR norm_tipo_desc(lc.codigo_nome_ug)        LIKE '%FURP%'
            OR norm_tipo_desc(lc.codigo_nome_ug)        LIKE '%FUND%REMEDIO POPULAR%'
            OR norm_tipo_desc(lc.codigo_nome_favorecido) LIKE '%FURP%'            THEN 'AUTARQUIA - FURP'
          WHEN norm_tipo_desc(lc.descricao_processo)    LIKE '%ONCOCENTRO%'
            OR norm_tipo_desc(lc.codigo_nome_ug)        LIKE '%ONCOCENTRO%'
            OR norm_tipo_desc(lc.codigo_nome_favorecido) LIKE '%ONCOCENTRO%'      THEN 'AUTARQUIA - ONCOCENTRO'
          WHEN norm_tipo_desc(lc.descricao_processo)    LIKE '%HCFAMEMA%'
            OR norm_tipo_desc(lc.codigo_nome_favorecido) LIKE '%FACULDADE%MEDICINA%MARILIA%' THEN 'HCFAMEMA'
          WHEN norm_tipo_desc(lc.descricao_processo)    LIKE '%HC%BOTUCATU%'
            OR norm_tipo_desc(lc.codigo_nome_ug)        LIKE '%HC%BOTUCATU%'
            OR norm_tipo_desc(lc.codigo_nome_ug)        LIKE '%HOSP%CLINICAS%BOTUCATU%'
            OR (norm_tipo_desc(lc.codigo_nome_favorecido) LIKE '%HOSPITAL DAS CLINICAS%'
                AND norm_tipo_desc(lc.codigo_nome_favorecido) LIKE '%BOTUCATU%') THEN 'HCBOTUCATU'
          WHEN norm_tipo_desc(lc.descricao_processo)    LIKE '%HC%RIBEIRAO%'
            OR norm_tipo_desc(lc.codigo_nome_ug)        LIKE '%HC%RIBEIRAO%'
            OR norm_tipo_desc(lc.codigo_nome_ug)        LIKE '%HOSP%CLINICAS%RIB%'
            OR (norm_tipo_desc(lc.codigo_nome_favorecido) LIKE '%HOSPITAL DAS CLINICAS%'
                AND norm_tipo_desc(lc.codigo_nome_favorecido) LIKE '%RIBEIRAO%') THEN 'HCRIBEIRÃO'
          WHEN norm_tipo_desc(lc.descricao_processo)    LIKE '%HOSPITAL DAS CLINICAS%'
            OR norm_tipo_desc(lc.codigo_nome_ug)        LIKE '%HOSPITAL DAS CLINICAS%'
            OR norm_tipo_desc(lc.codigo_nome_ug)        LIKE '%HOSP%CLINICAS%S%PAULO%'
            OR norm_tipo_desc(lc.codigo_nome_favorecido) LIKE '%HOSPITAL DAS CLINICAS%' THEN 'HCSP'
          -- ── Programas específicos ────────────────────────────────
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%GLICEMIA%'            THEN 'GLICEMIA'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%DOSE CERTA%'          THEN 'DOSE CERTA'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%CORUJAO%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%MUTIRAO%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%CIRURGIAS ELETIVAS%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%CIRURGIA ELETIVA%'
            OR norm_tipo_desc(lc.codigo_nome_projeto_atividade) LIKE '%MUTIROES DE SAUDE%' THEN 'CIRURGIAS ELETIVAS'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%AEDES AEGYPTI%'       THEN 'AEDES AEGYPTI'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%PISO%ATENCAO%BASICA%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%PISO DE ATENCAO BASICA%'
            OR norm_tipo_desc(lc.codigo_nome_projeto_atividade) LIKE '%PISO%ATENCAO%BASICA%' THEN 'PAB'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%PISO%ENFERMAGEM%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%PISO DA ENFERMAGEM%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%RESOLUCAO SS 124%'    THEN 'PISO ENFERMAGEM'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%CASAS DE APOIO%'      THEN 'CASAS DE APOIO'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%QUALIS MAIS%'         THEN 'QUALIS MAIS'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%TRANSTORNO%ESPECTRO%AUTISMO%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%AUTISMO%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '% TEA %'               THEN 'TEA'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%IGM SUS PAULISTA%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%IGM PAULISTA%'
            OR norm_tipo_desc(lc.codigo_nome_projeto_atividade) LIKE '%IGM SUS PAULISTA%' THEN 'IGM PAULISTA'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%TABELASUS PAULISTA%'  THEN 'TABELASUS PAULISTA'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%TABELA SUS PAULISTA%'
            OR norm_tipo_desc(lc.codigo_nome_projeto_atividade) LIKE '%TABELA SUS PAULISTA%' THEN 'TABELA SUS PAULISTA'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%REPELENTE%'           THEN 'REPELENTE'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%SORRIA SP%'           THEN 'SORRIA SP'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%RESIDENCIA TERAPEUTICA%'
            OR norm_tipo_desc(lc.codigo_nome_projeto_atividade) LIKE '%RESIDENCIA TERAPEUTICA%' THEN 'RESIDÊNCIA TERAPÊUTICA'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%SISTEMA PRISIONAL%'   THEN 'SISTEMA PRISIONAL'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%ACAO CIVIL%BAURU%'    THEN 'AÇÃO CIVIL - BAURU'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%ICESP%'
            OR norm_tipo_desc(lc.codigo_nome_ug)     LIKE '%ICESP%'              THEN 'ORGANIZAÇÃO SOCIAL'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%BATA CINZA%'          THEN 'INTRAORÇAMENTÁRIA - BATA CINZA PPP'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%PPP%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%PEROLA BYINGTON%'
            OR norm_tipo_desc(lc.codigo_nome_projeto_atividade) LIKE '%APOIO PPP%' THEN 'PPP'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%COBERTURA VACINAL%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%COBERTURA DE VACINA%'
            OR norm_tipo_desc(lc.codigo_nome_projeto_atividade) LIKE '%COBERTURA VACINAL%' THEN 'COBERTURA VACINAL'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%ARBOVIROSE%'
            OR norm_tipo_desc(lc.codigo_nome_projeto_atividade) LIKE '%ARBOVIROSE%' THEN 'ARBOVIROSE'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%SARAMPO%'
            OR norm_tipo_desc(lc.codigo_nome_projeto_atividade) LIKE '%SARAMPO%'  THEN 'SARAMPO'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%INTRAORCAMENTARIA%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%INTRA ORCAMENTARIA%'  THEN 'INTRAORÇAMENTÁRIA'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%TRANSFERENCIA VOLUNTARIA%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%TRANFERENCIA VOLUNTARIA%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%TRANSF%VOLUNTARIA%'   THEN 'TRANSFERÊNCIA VOLUNTÁRIA'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%CONTRIBUICAO DE SOLIDARIEDADE%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%CONTRIB%SOLIDARIEDADE%' THEN 'CONTRIBUIÇÃO DE SOLIDARIEDADE'
          -- ── Atenção Básica (antes de RESOLUCAO SS para não colidir) ──
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%ATENCAO BASICA%'
            OR norm_tipo_desc(lc.codigo_nome_projeto_atividade) LIKE '%ATENCAO BASICA%' THEN 'ATENÇÃO BÁSICA'
          -- ── Gestão Estadual SUS (antes de RESOLUCAO SS) ─────────────
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%GESTAO ESTADUAL%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%GESTAO PLENA%'
            OR norm_tipo_desc(lc.codigo_nome_projeto_atividade) LIKE '%GESTAO ESTADUAL%'
            OR norm_tipo_desc(lc.codigo_nome_ug)    LIKE '%DEPTO%REG%SAUDE%'     THEN 'GESTÃO ESTADUAL SUS'
          -- ── Tabelasus / Tabela SUS Paulista ──────────────────────
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%TETO FIXO FILANTROPICOS%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%RESOLUCAO SS N%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%RESOLUCAO SS 198%'    THEN 'TABELASUS PAULISTA'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%RESOLUCAO SS 164%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%PAGAMENTO RESOLUCAO SS%' THEN 'TABELA SUS PAULISTA'
          -- ── Fundo a Fundo ─────────────────────────────────────────
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%FUNDO A FUNDO%EMENDA%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%EMENDA%FUNDO A FUNDO%' THEN 'FUNDO A FUNDO - EMENDA'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%FUNDO A FUNDO%DEMANDA%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%FUNDO A FUNDO%PARLAMENTAR%' THEN 'FUNDO A FUNDO - DEMANDAS PARLAMENTARES'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%FUNDO A FUNDO PAB%'   THEN 'FUNDO A FUNDO PAB'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%FUNDO A FUNDO%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%TRANSFERENCIA%FUNDO%FUNDO%'
            OR norm_tipo_desc(lc.codigo_nome_projeto_atividade) LIKE '%FUNDO A FUNDO%' THEN 'FUNDO A FUNDO'
          -- ── Emenda ────────────────────────────────────────────────
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%RESOLUCAO SS%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%SAUDE HUMANA%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%APAE%'              THEN 'EMENDA'
          -- ── OS / Convênio / Contrato ──────────────────────────────
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%EXECUCAO DAS ATIVIDADES%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%CONTRATO DE GESTAO%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%CONTRATO GESTAO%'   THEN 'ORGANIZAÇÃO SOCIAL'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%CONVENIO%'
            OR norm_tipo_desc(lc.codigo_nome_projeto_atividade) LIKE '%CONVENIO%' THEN 'CONVÊNIO'
          -- ── Normalização de variantes existentes ──────────────────
          WHEN lc.tipo_despesa IN ('TRANFERÊNCIA VOLUNTÁRIA','TRANFERENCIA VOLUNTARIA','TRANSFERENCIA VOLUNTARIA')
               THEN 'TRANSFERÊNCIA VOLUNTÁRIA'
          WHEN lc.tipo_despesa IN ('GESTAO ESTADUAL')                           THEN 'GESTÃO ESTADUAL SUS'
          WHEN lc.tipo_despesa IN ('ATENCAO BASICA','ATENÇÃO BÁSICA')           THEN 'ATENÇÃO BÁSICA'
          WHEN lc.tipo_despesa IN ('CONVENIO','CONVÊNIO')                       THEN 'CONVÊNIO'
          WHEN lc.tipo_despesa IN ('CONTRATO GESTAO','CONTRATO DE GESTAO',
                                   'CONTRATO GESTÃO','CONTRATO DE GESTÃO')      THEN 'ORGANIZAÇÃO SOCIAL'
          WHEN lc.tipo_despesa IN ('ORGANIZACAO SOCIAL')                        THEN 'ORGANIZAÇÃO SOCIAL'
          WHEN lc.tipo_despesa IN ('INTRAORCAMENTARIA','INTRAORÇAMENTÁRIA')     THEN 'INTRAORÇAMENTÁRIA'
          WHEN lc.tipo_despesa IN ('RESIDENCIA TERAPEUTICA')                    THEN 'RESIDÊNCIA TERAPÊUTICA'
          WHEN lc.tipo_despesa IN ('CIRURGIA ELETIVA','CIRURGIAS ELETIVAS')     THEN 'CIRURGIAS ELETIVAS'
          WHEN lc.tipo_despesa IN ('IGM SUS PAULISTA')                          THEN 'IGM PAULISTA'
          ELSE lc.tipo_despesa
        END
      ) AS novo_tipo
    FROM public.lc131_despesas lc
    LEFT JOIN public.bd_ref_lookup_l1 r1
      ON  r1.codigo_nome_ug                = lc.codigo_nome_ug
      AND r1.descricao_processo            = lc.descricao_processo
      AND r1.codigo_nome_projeto_atividade = lc.codigo_nome_projeto_atividade
    LEFT JOIN public.bd_ref_lookup_l2 r2
      ON  r2.codigo_nome_ug     = lc.codigo_nome_ug
      AND r2.descricao_processo = lc.descricao_processo
    LEFT JOIN public.bd_ref_lookup_l3 r3
      ON  r3.codigo_nome_ug                = lc.codigo_nome_ug
      AND r3.codigo_nome_projeto_atividade = lc.codigo_nome_projeto_atividade
    WHERE lc.ano_referencia = p_ano
      AND (p_id_min IS NULL OR lc.id >= p_id_min)
      AND (p_id_max IS NULL OR lc.id <= p_id_max)
  ) src
  WHERE d.ctid = src.ctid
    AND d.tipo_despesa IS DISTINCT FROM src.novo_tipo;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN json_build_object(
    'updated', n, 'ano', p_ano, 'id_min', p_id_min, 'id_max', p_id_max
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fix_tipo_despesa_by_year(INT, BIGINT, BIGINT) TO anon, authenticated;

-- ─ 7. get_lc131_id_range() (inalterado) ──────────────────────────
CREATE OR REPLACE FUNCTION public.get_lc131_id_range(p_ano INT)
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public SET statement_timeout = 0
AS $$
  SELECT json_build_object('min_id',MIN(id),'max_id',MAX(id),'total',COUNT(*))
  FROM public.lc131_despesas WHERE ano_referencia = p_ano;
$$;

GRANT EXECUTE ON FUNCTION public.get_lc131_id_range(INT) TO anon, authenticated;

SELECT 'fix_tipo_despesa_by_year v8.0 (L1/L2/L3 uniq + CASE WHEN fallback) criada com sucesso' AS status;
`;

fs.writeFileSync('scripts/fix-tipo-by-year.sql', sql, 'utf8');
const lines = sql.split('\n').length;
const bytes = Buffer.byteLength(sql, 'utf8');
// Quick validation
const hasDollar = (sql.match(/\$\$/g) || []).length;
const hasL4 = sql.includes('bd_ref_lookup_l4');
console.log(`OK - lines: ${lines} | bytes: ${bytes} | $$ count: ${hasDollar} | has L4: ${hasL4}`);
