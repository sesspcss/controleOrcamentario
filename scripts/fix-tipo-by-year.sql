-- ================================================================
-- fix_tipo_despesa_by_year(p_ano INT)  — versão 9.0
-- Arquitetura corrigida:
--   PRIORIDADE 1: Padrões textuais semânticos (CASE WHEN sem ELSE)
--   PRIORIDADE 2: L1 (ug+desc+proj exato) de bd_ref_tipo — normalizado
--   PRIORIDADE 3: L2 (ug+desc) somente quando tipo ÚNICO — normalizado
--   PRIORIDADE 4: L3 (ug+proj) somente quando tipo ÚNICO — normalizado
--   PRIORIDADE 5: Valor existente normalizado (norm_tipo_final)
-- bd_ref_tipo serviu para classificar o que pode, mas muitas descrições
-- estão mapeadas como TV no Excel-ref mesmo quando deveriam ser outro tipo;
-- por isso o padrão textual tem maior confiança e deve rodar PRIMEIRO.
-- ================================================================

-- ─ 0. Corrige trg_enrich_lc131 (remove referências à public.bd_ref dropada) ──
CREATE OR REPLACE FUNCTION public.trg_enrich_lc131()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $trg$
DECLARE
  v_tm  public.tab_municipios%ROWTYPE;
BEGIN
  IF NEW.nome_municipio IS NOT NULL AND TRIM(NEW.nome_municipio) <> '' THEN
    SELECT * INTO v_tm FROM public.tab_municipios
    WHERE municipio = public.norm_munic(NEW.nome_municipio) LIMIT 1;
  END IF;
  IF v_tm IS NULL AND NEW.municipio IS NOT NULL AND TRIM(NEW.municipio) <> '' THEN
    SELECT * INTO v_tm FROM public.tab_municipios
    WHERE municipio = public.norm_munic(NEW.municipio) LIMIT 1;
  END IF;
  IF v_tm IS NULL AND NEW.cod_ibge IS NOT NULL AND TRIM(NEW.cod_ibge) <> '' THEN
    SELECT * INTO v_tm FROM public.tab_municipios
    WHERE cod_ibge = NEW.cod_ibge LIMIT 1;
  END IF;
  IF v_tm IS NOT NULL THEN
    NEW.drs       := COALESCE(NULLIF(TRIM(NEW.drs),''),       v_tm.drs);
    NEW.rras      := COALESCE(NULLIF(TRIM(NEW.rras),''),      v_tm.rras);
    NEW.regiao_ad := COALESCE(NULLIF(TRIM(NEW.regiao_ad),''), v_tm.regiao_ad);
    NEW.regiao_sa := COALESCE(NULLIF(TRIM(NEW.regiao_sa),''), v_tm.regiao_sa);
    NEW.cod_ibge  := COALESCE(NULLIF(TRIM(NEW.cod_ibge),''),  v_tm.cod_ibge);
    NEW.municipio := COALESCE(NULLIF(TRIM(NEW.municipio),''), v_tm.municipio_orig, v_tm.municipio);
  END IF;
  IF NEW.grupo_despesa IS NULL AND NEW.codigo_nome_grupo IS NOT NULL THEN
    NEW.grupo_despesa := TRIM(NEW.codigo_nome_grupo);
  END IF;
  IF NEW.municipio IS NULL AND NEW.nome_municipio IS NOT NULL THEN
    NEW.municipio := public.norm_munic(NEW.nome_municipio);
  END IF;
  NEW.pago_total := COALESCE(NEW.pago, 0) + COALESCE(NEW.pago_anos_anteriores, 0);

  -- ── rotulo: preenche no INSERT → UPDATE posterior toca 0 linhas (sem dead tuples) ──
  IF NEW.rotulo IS NULL OR TRIM(NEW.rotulo) = '' THEN
    NEW.rotulo := TRIM(NEW.codigo_nome_projeto_atividade);
  END IF;

  -- ── tipo_despesa: tenta L1→L2→L3→L4 no INSERT ──────────────────────────────────
  -- fix_tipo_despesa_by_year usa "IS DISTINCT FROM" → só atualiza se o valor
  -- estiver errado, pelo que linhas já corretas não geram dead tuples.
  -- Se os lookups estiverem vazios (primeiro deploy), retorna NULL e fix_tipo
  -- assume a classificação normalmente.
  IF NEW.tipo_despesa IS NULL OR TRIM(NEW.tipo_despesa) = '' THEN
    NEW.tipo_despesa := COALESCE(
      (SELECT l1.tipo_despesa FROM public.bd_ref_lookup_l1 l1
       WHERE l1.codigo_nome_ug                = NEW.codigo_nome_ug
         AND l1.descricao_processo            = NEW.descricao_processo
         AND l1.codigo_nome_projeto_atividade = NEW.codigo_nome_projeto_atividade
       LIMIT 1),
      (SELECT l2.tipo_despesa FROM public.bd_ref_lookup_l2 l2
       WHERE l2.codigo_nome_ug     = NEW.codigo_nome_ug
         AND l2.descricao_processo = NEW.descricao_processo
       LIMIT 1),
      (SELECT l3.tipo_despesa FROM public.bd_ref_lookup_l3 l3
       WHERE l3.codigo_nome_ug                = NEW.codigo_nome_ug
         AND l3.codigo_nome_projeto_atividade = NEW.codigo_nome_projeto_atividade
       LIMIT 1),
      (SELECT l4.tipo_despesa FROM public.bd_ref_lookup_l4 l4
       WHERE l4.codigo_nome_ug = NEW.codigo_nome_ug
       LIMIT 1)
    );
  END IF;

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
DROP FUNCTION IF EXISTS public.norm_tipo_final(TEXT);
DROP TABLE    IF EXISTS public.bd_ref_lookup_full  CASCADE;
DROP TABLE    IF EXISTS public.bd_ref_lookup_desc  CASCADE;
DROP TABLE    IF EXISTS public.bd_ref_lookup_proj  CASCADE;
DROP TABLE    IF EXISTS public.bd_ref_lookup_l1    CASCADE;
DROP TABLE    IF EXISTS public.bd_ref_lookup_l2    CASCADE;
DROP TABLE    IF EXISTS public.bd_ref_lookup_l3    CASCADE;
DROP TABLE    IF EXISTS public.bd_ref_lookup_l4    CASCADE;

-- ─ 2a. norm_tipo_desc — normaliza texto para comparação (remove acentos, upper) ──
CREATE OR REPLACE FUNCTION public.norm_tipo_desc(txt TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT SET search_path = public AS $$
  SELECT upper(trim(regexp_replace(
    translate(
      coalesce(txt, ''),
      'áàãâäéèêëíìîïóòõôöúùûüçñÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ',
      'aaaaaaeeeeiiiiooooouuuuucnAAAAAAAAEEEEIIIIOOOOOUUUUCN'
    ),
    '\s+', ' ', 'g'
  )));
$$;
GRANT EXECUTE ON FUNCTION public.norm_tipo_desc(TEXT) TO anon, authenticated;

-- ─ 2b. norm_tipo_final — normaliza o NOME do tipo (variantes → canônico) ─────
-- Garante que tipos com grafia errada ou desatualizada sejam padronizados.
-- STRICT: retorna NULL para NULL (seguro em COALESCE).
CREATE OR REPLACE FUNCTION public.norm_tipo_final(t TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT SET search_path = public AS $$
  SELECT CASE public.norm_tipo_desc(t)
    WHEN 'GESTAO ESTADUAL'               THEN 'GESTÃO ESTADUAL SUS'
    WHEN 'GESTAO ESTADUAL SUS'           THEN 'GESTÃO ESTADUAL SUS'
    WHEN 'IGM SUS PAULISTA'              THEN 'IGM PAULISTA'
    WHEN 'ORGANIZACAO SOCIAL'            THEN 'ORGANIZAÇÃO SOCIAL'
    WHEN 'CONVENIO'                      THEN 'CONVÊNIO'
    WHEN 'TRANSFERENCIA VOLUNTARIA'      THEN 'TRANSFERÊNCIA VOLUNTÁRIA'
    WHEN 'TRANFERENCIA VOLUNTARIA'       THEN 'TRANSFERÊNCIA VOLUNTÁRIA'
    WHEN 'UNIDADE PROPRIA'               THEN 'UNIDADE PRÓPRIA'
    WHEN 'ATENCAO BASICA'               THEN 'ATENÇÃO BÁSICA'
    WHEN 'RESIDENCIA TERAPEUTICA'        THEN 'RESIDÊNCIA TERAPÊUTICA'
    WHEN 'INTRAORCAMENTARIA'             THEN 'INTRAORÇAMENTÁRIA'
    WHEN 'CONTRIBUICAO DE SOLIDARIEDADE' THEN 'CONTRIBUIÇÃO DE SOLIDARIEDADE'
    WHEN 'CIRURGIA ELETIVA'              THEN 'CIRURGIAS ELETIVAS'
    WHEN 'CONTRATO GESTAO'               THEN 'ORGANIZAÇÃO SOCIAL'
    WHEN 'CONTRATO DE GESTAO'            THEN 'ORGANIZAÇÃO SOCIAL'
    WHEN 'CONTRATO GESTAO'              THEN 'ORGANIZAÇÃO SOCIAL'
    WHEN 'CONTRATO DE GESTAO'           THEN 'ORGANIZAÇÃO SOCIAL'    WHEN 'TABELASUS PAULISTA'            THEN 'TABELA SUS PAULISTA'    ELSE t
  END
$$;
GRANT EXECUTE ON FUNCTION public.norm_tipo_final(TEXT) TO anon, authenticated;

-- ─ 3. Tabelas de lookup ───────────────────────────────────────────

-- L1: (ug + desc + proj) — tipo majoritário de bd_ref_tipo (já normalizado)
CREATE TABLE public.bd_ref_lookup_l1 (
  codigo_nome_ug                TEXT NOT NULL,
  descricao_processo            TEXT NOT NULL,
  codigo_nome_projeto_atividade TEXT NOT NULL,
  tipo_despesa                  TEXT NOT NULL,
  PRIMARY KEY (codigo_nome_ug, descricao_processo, codigo_nome_projeto_atividade)
);

-- L2: (ug + desc) — somente quando tipo ÚNICO na combinação (já normalizado)
CREATE TABLE public.bd_ref_lookup_l2 (
  codigo_nome_ug     TEXT NOT NULL,
  descricao_processo TEXT NOT NULL,
  tipo_despesa       TEXT NOT NULL,
  PRIMARY KEY (codigo_nome_ug, descricao_processo)
);

-- L3: (ug + proj) — somente quando tipo ÚNICO na combinação (já normalizado)
CREATE TABLE public.bd_ref_lookup_l3 (
  codigo_nome_ug                TEXT NOT NULL,
  codigo_nome_projeto_atividade TEXT NOT NULL,
  tipo_despesa                  TEXT NOT NULL,
  PRIMARY KEY (codigo_nome_ug, codigo_nome_projeto_atividade)
);

-- L4: tipo majoritário por UG — fallback genérico (cobre linhas sem match exato em L1/L2/L3)
CREATE TABLE public.bd_ref_lookup_l4 (
  codigo_nome_ug TEXT NOT NULL PRIMARY KEY,
  tipo_despesa   TEXT NOT NULL
);

-- ─ 4. Índices em lc131_despesas ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lc131_ano_id
  ON public.lc131_despesas (ano_referencia, id);

CREATE INDEX IF NOT EXISTS idx_lc131_ug_desc_proj
  ON public.lc131_despesas (codigo_nome_ug, descricao_processo, codigo_nome_projeto_atividade);

-- ─ 5. refresh_bdref_lookup() ─────────────────────────────────────
-- Nota: norm_tipo_final() é aplicado ao tipo ao inserir nos lookups.
-- Assim o lookup já devolve o nome canônico correto.
CREATE FUNCTION public.refresh_bdref_lookup()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n1 INT; n2 INT; n3 INT; n4 INT;
  bdref_count BIGINT;
BEGIN
  -- Guard: se bd_ref_tipo estiver vazio, preserva L1-4 já populados.
  -- Isso acontece após post_import_cleanup truncar bd_ref_tipo para liberar espaço.
  SELECT count(*) INTO bdref_count FROM public.bd_ref_tipo;
  IF bdref_count = 0 THEN
    SELECT count(*) INTO n1 FROM public.bd_ref_lookup_l1;
    SELECT count(*) INTO n2 FROM public.bd_ref_lookup_l2;
    SELECT count(*) INTO n3 FROM public.bd_ref_lookup_l3;
    SELECT count(*) INTO n4 FROM public.bd_ref_lookup_l4;
    RETURN json_build_object(
      'l1_ug_desc_proj',  n1,
      'l2_ug_desc_unico', n2,
      'l3_ug_proj_unico', n3,
      'l4_ug_fallback',   n4,
      'source', 'cached (bd_ref_tipo vazio — lookups L1-4 preservados)'
    );
  END IF;

  -- L1: tipo mais frequente por (ug + desc + proj)
  TRUNCATE TABLE public.bd_ref_lookup_l1;
  INSERT INTO public.bd_ref_lookup_l1
    (codigo_nome_ug, descricao_processo, codigo_nome_projeto_atividade, tipo_despesa)
  SELECT DISTINCT ON (codigo_nome_ug, descricao_processo, codigo_nome_projeto_atividade)
    codigo_nome_ug, descricao_processo, codigo_nome_projeto_atividade,
    public.norm_tipo_final(tipo_despesa) AS tipo_despesa
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

  -- L2: (ug + desc) único
  TRUNCATE TABLE public.bd_ref_lookup_l2;
  INSERT INTO public.bd_ref_lookup_l2 (codigo_nome_ug, descricao_processo, tipo_despesa)
  SELECT codigo_nome_ug, descricao_processo,
         public.norm_tipo_final(MAX(tipo_despesa)) AS tipo_despesa
  FROM bd_ref_tipo
  WHERE  codigo_nome_ug IS NOT NULL
    AND  descricao_processo IS NOT NULL
    AND  tipo_despesa IS NOT NULL
  GROUP BY codigo_nome_ug, descricao_processo
  HAVING COUNT(DISTINCT tipo_despesa) = 1;
  GET DIAGNOSTICS n2 = ROW_COUNT;

  -- L3: (ug + proj) único
  TRUNCATE TABLE public.bd_ref_lookup_l3;
  INSERT INTO public.bd_ref_lookup_l3 (codigo_nome_ug, codigo_nome_projeto_atividade, tipo_despesa)
  SELECT codigo_nome_ug, codigo_nome_projeto_atividade,
         public.norm_tipo_final(MAX(tipo_despesa)) AS tipo_despesa
  FROM bd_ref_tipo
  WHERE  codigo_nome_ug IS NOT NULL
    AND  codigo_nome_projeto_atividade IS NOT NULL
    AND  tipo_despesa IS NOT NULL
  GROUP BY codigo_nome_ug, codigo_nome_projeto_atividade
  HAVING COUNT(DISTINCT tipo_despesa) = 1;
  GET DIAGNOSTICS n3 = ROW_COUNT;

  -- L4: tipo mais frequente por UG — fallback para linhas que L1/L2/L3 não cobrem
  TRUNCATE TABLE public.bd_ref_lookup_l4;
  INSERT INTO public.bd_ref_lookup_l4 (codigo_nome_ug, tipo_despesa)
  SELECT DISTINCT ON (codigo_nome_ug)
    codigo_nome_ug,
    public.norm_tipo_final(tipo_despesa)
  FROM (
    SELECT codigo_nome_ug, tipo_despesa, count(*) AS cnt
    FROM bd_ref_tipo
    WHERE codigo_nome_ug IS NOT NULL AND tipo_despesa IS NOT NULL
    GROUP BY codigo_nome_ug, tipo_despesa
  ) g
  ORDER BY codigo_nome_ug, cnt DESC;
  GET DIAGNOSTICS n4 = ROW_COUNT;

  ANALYZE public.bd_ref_lookup_l1;
  ANALYZE public.bd_ref_lookup_l2;
  ANALYZE public.bd_ref_lookup_l3;
  ANALYZE public.bd_ref_lookup_l4;

  RETURN json_build_object(
    'l1_ug_desc_proj',  n1,
    'l2_ug_desc_unico', n2,
    'l3_ug_proj_unico', n3,
    'l4_ug_fallback',   n4
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.refresh_bdref_lookup() TO anon, authenticated;

-- IMPORTANTE: NÃO rodar refresh aqui — execute em SQL Editor separado DEPOIS:
--   SELECT public.refresh_bdref_lookup();
-- Isso evita travar o banco com 416k linhas na mesma transação do deploy.

-- ─ 6. fix_tipo_despesa_by_year() ──────────────────────────────────
-- NOVA ARQUITETURA DE PRIORIDADE:
--   1º CASE WHEN textual (sem ELSE → NULL se não bater) — MAIOR CONFIANÇA
--   2º Lookup L1 (já normalizado)
--   3º Lookup L2 (já normalizado)
--   4º Lookup L3 (já normalizado)
--   5º norm_tipo_final(existente) — normaliza variantes de grafia
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
        -- ─── PRIORIDADE 1: padrões textuais semânticos ─────────────
        -- SEM ELSE: retorna NULL se nenhum padrão bater, permitindo
        -- que o lookup das camadas seguintes entre em ação.
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
          WHEN norm_tipo_desc(lc.descricao_processo)     LIKE '%HEMOCENTRO%'
            OR norm_tipo_desc(lc.codigo_nome_ug)         LIKE '%HEMOCENTRO%'
            OR norm_tipo_desc(lc.codigo_nome_favorecido) LIKE '%HEMOCENTRO%'      THEN 'AUTARQUIA - HEMOCENTRO'
          WHEN norm_tipo_desc(lc.descricao_processo)     LIKE '%FURP%'
            OR norm_tipo_desc(lc.codigo_nome_ug)         LIKE '%FURP%'
            OR norm_tipo_desc(lc.codigo_nome_ug)         LIKE '%FUND%REMEDIO POPULAR%'
            OR norm_tipo_desc(lc.codigo_nome_favorecido) LIKE '%FURP%'            THEN 'AUTARQUIA - FURP'
          WHEN norm_tipo_desc(lc.descricao_processo)     LIKE '%ONCOCENTRO%'
            OR norm_tipo_desc(lc.codigo_nome_ug)         LIKE '%ONCOCENTRO%'
            OR norm_tipo_desc(lc.codigo_nome_favorecido) LIKE '%ONCOCENTRO%'      THEN 'AUTARQUIA - ONCOCENTRO'
          WHEN norm_tipo_desc(lc.descricao_processo)     LIKE '%HCFAMEMA%'
            OR norm_tipo_desc(lc.codigo_nome_favorecido) LIKE '%FACULDADE%MEDICINA%MARILIA%' THEN 'HCFAMEMA'
          WHEN norm_tipo_desc(lc.descricao_processo)     LIKE '%HC%BOTUCATU%'
            OR norm_tipo_desc(lc.codigo_nome_ug)         LIKE '%HC%BOTUCATU%'
            OR norm_tipo_desc(lc.codigo_nome_ug)         LIKE '%HOSP%CLINICAS%BOTUCATU%'
            OR (norm_tipo_desc(lc.codigo_nome_favorecido) LIKE '%HOSPITAL DAS CLINICAS%'
                AND norm_tipo_desc(lc.codigo_nome_favorecido) LIKE '%BOTUCATU%') THEN 'HCBOTUCATU'
          WHEN norm_tipo_desc(lc.descricao_processo)     LIKE '%HC%RIBEIRAO%'
            OR norm_tipo_desc(lc.codigo_nome_ug)         LIKE '%HC%RIBEIRAO%'
            OR norm_tipo_desc(lc.codigo_nome_ug)         LIKE '%HOSP%CLINICAS%RIB%'
            OR (norm_tipo_desc(lc.codigo_nome_favorecido) LIKE '%HOSPITAL DAS CLINICAS%'
                AND norm_tipo_desc(lc.codigo_nome_favorecido) LIKE '%RIBEIRAO%') THEN 'HCRIBEIRÃO'
          WHEN norm_tipo_desc(lc.descricao_processo)     LIKE '%HOSPITAL DAS CLINICAS%'
            OR norm_tipo_desc(lc.codigo_nome_ug)         LIKE '%HOSPITAL DAS CLINICAS%'
            OR norm_tipo_desc(lc.codigo_nome_ug)         LIKE '%HOSP%CLINICAS%S%PAULO%'
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
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%REPELENTE%'           THEN 'REPELENTE'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%SORRIA SP%'           THEN 'SORRIA SP'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%RESIDENCIA TERAPEUTICA%'
            OR norm_tipo_desc(lc.codigo_nome_projeto_atividade) LIKE '%RESIDENCIA TERAPEUTICA%' THEN 'RESIDÊNCIA TERAPÊUTICA'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%SISTEMA PRISIONAL%'   THEN 'SISTEMA PRISIONAL'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%ACAO CIVIL%BAURU%'    THEN 'AÇÃO CIVIL - BAURU'
          -- ── Tabelasus — VEM ANTES de GESTÃO ESTADUAL ────────────
          -- (TETO FIXO FILANTROPICOS é pagamento tabela SUS, não gestão estadual)
          -- EXCLUIR: elemento 334130 (Material de Consumo) e fonte 163150
          -- não são pagamentos de produção hospitalar — têm tipo diferente
          WHEN (norm_tipo_desc(lc.descricao_processo) LIKE '%TABELASUS PAULISTA%'
            OR  norm_tipo_desc(lc.descricao_processo) LIKE '%TABELA SUS PAULISTA%'
            OR  norm_tipo_desc(lc.codigo_nome_projeto_atividade) LIKE '%TABELA SUS PAULISTA%')
            AND lc.codigo_nome_elemento NOT LIKE '%334130%'
            AND lc.codigo_nome_fonte_recurso NOT LIKE '%163150%'       THEN 'TABELA SUS PAULISTA'
          WHEN (norm_tipo_desc(lc.descricao_processo) LIKE '%TETO FIXO FILANTROPICOS%'
            OR  norm_tipo_desc(lc.descricao_processo) LIKE '%TETO MAC FILANTROPICOS%')
            AND lc.codigo_nome_elemento NOT LIKE '%334130%'
            AND lc.codigo_nome_fonte_recurso NOT LIKE '%163150%'       THEN 'TABELA SUS PAULISTA'
          WHEN (norm_tipo_desc(lc.descricao_processo) LIKE '%RESOLUCAO SS N%'
            OR  norm_tipo_desc(lc.descricao_processo) LIKE '%RESOLUCAO SS 198%')
            AND lc.codigo_nome_elemento NOT LIKE '%334130%'
            AND lc.codigo_nome_fonte_recurso NOT LIKE '%163150%'       THEN 'TABELA SUS PAULISTA'
          WHEN (norm_tipo_desc(lc.descricao_processo) LIKE '%RESOLUCAO SS 164%'
            OR  norm_tipo_desc(lc.descricao_processo) LIKE '%PAGAMENTO RESOLUCAO SS%')
            AND lc.codigo_nome_elemento NOT LIKE '%334130%'
            AND lc.codigo_nome_fonte_recurso NOT LIKE '%163150%'       THEN 'TABELA SUS PAULISTA'
          -- ── Intraorçamentária ────────────────────────────────────
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%BATA CINZA%'          THEN 'INTRAORÇAMENTÁRIA - BATA CINZA PPP'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%INTRAORCAMENTARIA%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%INTRA ORCAMENTARIA%'  THEN 'INTRAORÇAMENTÁRIA'
          -- ── PPP ─────────────────────────────────────────────────
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%PPP%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%PEROLA BYINGTON%'
            OR norm_tipo_desc(lc.codigo_nome_projeto_atividade) LIKE '%APOIO PPP%' THEN 'PPP'
          -- ── Cobertura vacinal / saúde pública ────────────────────
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%COBERTURA VACINAL%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%COBERTURA DE VACINA%'
            OR norm_tipo_desc(lc.codigo_nome_projeto_atividade) LIKE '%COBERTURA VACINAL%' THEN 'COBERTURA VACINAL'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%ARBOVIROSE%'
            OR norm_tipo_desc(lc.codigo_nome_projeto_atividade) LIKE '%ARBOVIROSE%' THEN 'ARBOVIROSE'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%SARAMPO%'
            OR norm_tipo_desc(lc.codigo_nome_projeto_atividade) LIKE '%SARAMPO%'  THEN 'SARAMPO'
          -- ── Fundo a Fundo ────────────────────────────────────────
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%FUNDO A FUNDO%EMENDA%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%EMENDA%FUNDO A FUNDO%' THEN 'FUNDO A FUNDO - EMENDA'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%FUNDO A FUNDO%DEMANDA%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%FUNDO A FUNDO%PARLAMENTAR%' THEN 'FUNDO A FUNDO - DEMANDAS PARLAMENTARES'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%FUNDO A FUNDO PAB%'   THEN 'FUNDO A FUNDO PAB'
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%FUNDO A FUNDO%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%TRANSFERENCIA%FUNDO%FUNDO%'
            OR norm_tipo_desc(lc.codigo_nome_projeto_atividade) LIKE '%FUNDO A FUNDO%' THEN 'FUNDO A FUNDO'
          -- ── Contribuição de solidariedade ────────────────────────
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%CONTRIBUICAO DE SOLIDARIEDADE%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%CONTRIB%SOLIDARIEDADE%' THEN 'CONTRIBUIÇÃO DE SOLIDARIEDADE'
          -- ── Atenção Básica ───────────────────────────────────────
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%PISO%ATENCAO%BASICA%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%ATENCAO BASICA%'
            OR norm_tipo_desc(lc.codigo_nome_projeto_atividade) LIKE '%ATENCAO BASICA%' THEN 'ATENÇÃO BÁSICA'
          -- ── Gestão Estadual SUS — VEM DEPOIS de Tabelasus ────────
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%GESTAO ESTADUAL%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%GESTAO PLENA%'
            OR norm_tipo_desc(lc.codigo_nome_projeto_atividade) LIKE '%GESTAO ESTADUAL%'
            OR norm_tipo_desc(lc.codigo_nome_ug)     LIKE '%DEPTO%REG%SAUDE%'    THEN 'GESTÃO ESTADUAL SUS'
          -- ── Emenda (RESOLUCAO SS genérico — após os específicos) ──
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%RESOLUCAO SS%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%SAUDE HUMANA%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%APAE%'               THEN 'EMENDA'
          -- ── ICESP → OS ──────────────────────────────────────────
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%ICESP%'
            OR norm_tipo_desc(lc.codigo_nome_ug)     LIKE '%ICESP%'              THEN 'ORGANIZAÇÃO SOCIAL'
          -- ── Transferência Voluntária ───────────────────────────────
          WHEN norm_tipo_desc(lc.descricao_processo) LIKE '%TRANSFERENCIA VOLUNTARIA%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%TRANFERENCIA VOLUNTARIA%'
            OR norm_tipo_desc(lc.descricao_processo) LIKE '%TRANSF%VOLUNTARIA%'   THEN 'TRANSFERÊNCIA VOLUNTÁRIA'
          -- ── Catch-all baseado na UG (cobre contratos sem padrão textual) ──
          WHEN norm_tipo_desc(lc.codigo_nome_ug) LIKE '%ORGANIZ%SOCIAL%'
            OR norm_tipo_desc(lc.codigo_nome_ug) LIKE '%CONTRATO DE GESTAO%'    THEN 'ORGANIZAÇÃO SOCIAL'
          WHEN norm_tipo_desc(lc.codigo_nome_ug) LIKE '%DEPTO%REG%SAUDE%'
            OR norm_tipo_desc(lc.codigo_nome_ug) LIKE '%DEPARTAMENTO%REGIONAL%' THEN 'GESTÃO ESTADUAL SUS'
          WHEN norm_tipo_desc(lc.codigo_nome_ug) LIKE '%UNIDADE%PROPRIA%'
            OR norm_tipo_desc(lc.codigo_nome_ug) LIKE '%HOSPITAL%'
            OR norm_tipo_desc(lc.codigo_nome_ug) LIKE '%AMBULATORIO%'           THEN 'UNIDADE PRÓPRIA'
          -- SEM ELSE: retorna NULL → proxima camada COALESCE entra em ação
        END,
        -- ─── PRIORIDADE 2-5: Lookup bd_ref_tipo (já normalizado) ──
        r1.tipo_despesa,
        r2.tipo_despesa,
        r3.tipo_despesa,
        r4.tipo_despesa,  -- L4: fallback por UG (cobre quase tudo que L1/L2/L3 não pegou)
        -- ─── PRIORIDADE 6: normaliza o tipo existente (exclui 'SEM CLASSIFICAÇÃO') ───
        NULLIF(public.norm_tipo_final(lc.tipo_despesa), 'SEM CLASSIFICAÇÃO'),
        NULLIF(lc.tipo_despesa, 'SEM CLASSIFICAÇÃO'),
        -- ─── PRIORIDADE 7 (último recurso): tipo baseado no grupo de despesa ──
        -- Grupo 3 = Custeio, 4 = Investimento, 1 = Pessoal, 2 = Dívida
        CASE
          WHEN lc.codigo_nome_grupo LIKE '1%' THEN 'PESSOAL E ENCARGOS SOCIAIS'
          WHEN lc.codigo_nome_grupo LIKE '2%' THEN 'JUROS E ENCARGOS DA DÍVIDA'
          WHEN lc.codigo_nome_grupo LIKE '3%' THEN 'OUTRAS DESPESAS CORRENTES'
          WHEN lc.codigo_nome_grupo LIKE '4%' THEN 'INVESTIMENTOS'
          WHEN lc.codigo_nome_grupo LIKE '5%' THEN 'INVERSÕES FINANCEIRAS'
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
    LEFT JOIN public.bd_ref_lookup_l4 r4
      ON  r4.codigo_nome_ug = lc.codigo_nome_ug
    WHERE lc.ano_referencia = p_ano
      AND (p_id_min IS NULL OR lc.id >= p_id_min)
      AND (p_id_max IS NULL OR lc.id <= p_id_max)
  ) src
  WHERE d.ctid = src.ctid
    AND src.novo_tipo IS NOT NULL
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

SELECT 'fix_tipo_despesa_by_year v9.3 (NULLIF SEM CLASSIFICAÇÃO + grupo fallback + rotulo population) criada com sucesso' AS status;

-- ─ 8. Popula rotulo onde ainda está vazio ──────────────────────────
-- Usar codigo_nome_projeto_atividade como rótulo proxy quando rotulo é NULL/vazio.
-- Executar UMA VEZ após rodar run-fix-tipo.mjs.
DO $$
DECLARE n INT;
BEGIN
  UPDATE public.lc131_despesas
  SET rotulo = TRIM(codigo_nome_projeto_atividade)
  WHERE (rotulo IS NULL OR rotulo = '')
    AND codigo_nome_projeto_atividade IS NOT NULL
    AND codigo_nome_projeto_atividade <> '';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'rotulo populado: % linhas', n;
END;
$$;
