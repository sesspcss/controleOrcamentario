-- ================================================================
-- PATCH: Tipo de Despesa com classificação por descricao_processo
-- Cria: tipo_despesa_ref, normalize_tipo_despesa_text(),
--       canonicalize_tipo_despesa(), classify_tipo_despesa()
-- Atualiza: lc131_dashboard, lc131_distincts, lc131_detail
-- Passo 1: rodar este arquivo no Supabase SQL Editor
-- Passo 2: executar `npx tsx scripts/import-tipo-despesa.ts`
-- ================================================================
SET statement_timeout = 0;

-- ───────────────────────────────────────────────────────────────
-- 0. Normalização e tabela de referência
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.normalize_tipo_despesa_text(p_text text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public
AS $$
  SELECT NULLIF(
    TRIM(
      regexp_replace(
        translate(
          UPPER(COALESCE(p_text, '')),
          'ÁÀÃÂÄÉÈẼÊËÍÌĨÎÏÓÒÕÔÖÚÙŨÛÜÇÑÝáàãâäéèẽêëíìĩîïóòõôöúùũûüçñýÿ',
          'AAAAAEEEEEIIIIIOOOOOUUUUUCNYAAAAAEEEEEIIIIIOOOOOUUUUUCNYY'
        ),
        '\s+',
        ' ',
        'g'
      )
    ),
    ''
  )
$$;

CREATE OR REPLACE FUNCTION public.canonicalize_tipo_despesa(p_tipo text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE public.normalize_tipo_despesa_text(p_tipo)
    WHEN 'EMENDAS' THEN 'EMENDA'
    WHEN 'GESTAO ESTADUAL' THEN 'GESTÃO ESTADUAL'
    WHEN 'TABELASUS PAULISTA' THEN 'TABELA SUS PAULISTA'
    WHEN 'PISO DA ENFERMAGEM' THEN 'PISO ENFERMAGEM'
    WHEN 'RLM FERNANDOPOLIS' THEN 'RLM FERNANDÓPOLIS'
    WHEN 'RLM PARIQUERA ACU' THEN 'RLM PARIQUERA ACÚ'
    ELSE NULLIF(TRIM(p_tipo), '')
  END
$$;

CREATE TABLE IF NOT EXISTS public.tipo_despesa_ref (
  descricao_processo_norm    text PRIMARY KEY,
  descricao_processo_exemplo text NOT NULL,
  tipo_despesa               text NOT NULL,
  ocorrencias                integer NOT NULL DEFAULT 1,
  atualizado_em              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tipo_despesa_ref_tipo
  ON public.tipo_despesa_ref (tipo_despesa);

COMMENT ON TABLE public.tipo_despesa_ref IS
  'Mapa normalizado descricao_processo -> tipo_despesa importado da planilha TIPO_DESPESA.xlsx';


-- ───────────────────────────────────────────────────────────────
-- 1. Função auxiliar de classificação
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.classify_tipo_despesa(
  p_descricao text,
  p_tipo      text
) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_desc_norm text;
  v_tipo_ref  text;
BEGIN
  v_desc_norm := public.normalize_tipo_despesa_text(p_descricao);

  IF v_desc_norm IS NOT NULL THEN
    SELECT ref.tipo_despesa
      INTO v_tipo_ref
    FROM public.tipo_despesa_ref AS ref
    WHERE ref.descricao_processo_norm = v_desc_norm;

    IF v_tipo_ref IS NOT NULL THEN
      RETURN v_tipo_ref;
    END IF;
  END IF;

  RETURN public.canonicalize_tipo_despesa(
    CASE

    -- ── INTRAORÇAMENTÁRIA - BATA CINZA PPP ───────────────────────────
    WHEN v_desc_norm = 'INTRA'
      OR p_descricao ILIKE '%BATA CINZA%'                      THEN 'INTRAORÇAMENTÁRIA - BATA CINZA PPP'

    -- ── INTRAORÇAMENTÁRIA ────────────────────────────────────────────
    WHEN p_descricao ILIKE '%TRANSFERENCIA INTRA ORCAMENTARIA%'
      OR p_descricao ILIKE '%INTRA ORCAMENTARIA%'
      OR p_descricao ILIKE '%SECRETARIA DESENVOLVIMENTO SOCIAL%'
      OR p_descricao ILIKE '%TRANSFERENCIA INTRAORCAMENTARIA%' THEN 'INTRAORÇAMENTÁRIA'

    -- ── DÍVIDA EXTERNA E INTERNA (exact match: sem espaço) ───────────
    WHEN v_desc_norm = 'INTRAORCAMENTARIA'                    THEN 'DIVIDA EXTERNA E INTERNA'

    -- ── FUNDO A FUNDO PAB ─────────────────────────────────────────────
    WHEN p_descricao ILIKE '%FUNDO A FUNDO PAB%'               THEN 'FUNDO A FUNDO PAB'

    -- ── RESIDÊNCIA TERAPÊUTICA ────────────────────────────────────────
    WHEN p_descricao ILIKE '%RESIDENCIA TERAPEUTICA%'
      OR p_descricao ILIKE '%RESIDÊNCIA TERAPÊUTICA%'
      OR p_descricao ILIKE '%FUNDO A FUNDO RESIDENCIA%'
      OR p_descricao ILIKE '%FUNDO A FUNDO - RESIDENCIA%'
      OR p_descricao ILIKE '%RESOLUCAO SS N. 31%'              THEN 'RESIDÊNCIA TERAPÊUTICA'

    -- ── FUNDO A FUNDO - DEMANDAS PARLAMENTARES ────────────────────────
    WHEN p_descricao ILIKE '%FUNDO A FUNDO%DEMANDAS%'
      OR p_descricao ILIKE '%FUNDO A FUNDO - DEMANDAS%'        THEN 'FUNDO A FUNDO - DEMANDAS PARLAMENTARES'

    -- ── FUNDO A FUNDO - EMENDA ────────────────────────────────────────
    WHEN p_descricao ILIKE '%FUNDO A FUNDO%EMENDA%'
      OR p_descricao ILIKE '%FUNDO A FUNDO - EMENDA%'          THEN 'FUNDO A FUNDO - EMENDA'

    -- ── FUNDO A FUNDO (genérico) ──────────────────────────────────────
    WHEN p_descricao ILIKE '%FUNDO A FUNDO%'                   THEN 'FUNDO A FUNDO'

    -- ── RLM – cidades específicas (mais específico primeiro) ──────────
    WHEN p_descricao ILIKE '%RLM FERNANDOPOLIS%'
      OR p_descricao ILIKE '%RLM FERNANDÓPOLIS%'               THEN 'RLM FERNANDÓPOLIS'
    WHEN p_descricao ILIKE '%RLM MOGI MIRIM%'
      OR p_descricao ILIKE '%LUCY MONTORO MOGI MIRIM%'         THEN 'RLM MOGI MIRIM'
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
      OR (p_descricao ILIKE '%RLM%' AND p_descricao ILIKE '%DIADEMA%')
                                                               THEN 'RLM DIADEMA'
    WHEN p_descricao ILIKE '%RLM TAUBATE%'
      OR p_descricao ILIKE '%CONTRATO DE GESTAO RLM TAUBATE%'
      OR p_descricao ILIKE '%LUCY MONTORO TAUBATE%'            THEN 'RLM TAUBATE'
    WHEN p_descricao ILIKE '%RLM BOTUCATU%'
      OR p_descricao ILIKE '%CONTRATO DE GESTAO RLM BOTUCATU%'
      OR p_descricao ILIKE '%LUCY MONTORO BOTUCATU%'           THEN 'RLM BOTUCATU'
    WHEN p_descricao ILIKE '%PARIQUERA%'                       THEN 'RLM PARIQUERA ACÚ'
    WHEN p_descricao ILIKE '%RLM SOROCABA%'
      OR p_descricao ILIKE '%CONTRATO DE GESTAO - RLM SOROCABA%'
      OR p_descricao ILIKE '%LUCY MONTORO SOROCABA%'           THEN 'RLM SOROCABA'
    WHEN p_descricao ILIKE '%RLM PRESIDENTE PRUDENTE%'
      OR p_descricao ILIKE '%CONTRATO GESTAO RLM PRESIDENTE PRUDENTE%'
      OR (p_descricao ILIKE '%RLM%'
          AND (p_descricao ILIKE '%PRESIDENTE PRUDENTE%'
            OR p_descricao ILIKE '%PRES. PRUDENTE%'))          THEN 'RLM PRESIDENTE PRUDENTE'
    WHEN p_descricao ILIKE '%RLM SANTOS%'
      OR p_descricao ILIKE '%CONTRATO GESTAO RLM SANTOS%'
      OR p_descricao ILIKE '%LUCY MONTORO SANTOS%'             THEN 'RLM SANTOS'
    WHEN (p_descricao ILIKE '%RLM%' AND p_descricao ILIKE '%MARILIA%')
      OR p_descricao ILIKE '%LUCY MONTORO MARILIA%'            THEN 'RLM MARILIA'
    WHEN (p_descricao ILIKE '%RLM%' AND p_descricao ILIKE '%CAMPINAS%')
      OR p_descricao ILIKE '%LUCY MONTORO CAMPINAS%'           THEN 'RLM CAMPINAS'
    WHEN p_descricao ILIKE '%CONTRATO GESTAO P/ ATENDER INST. LUCY MONTORO%'
                                                               THEN 'REDE LUCY MONTORO'
    WHEN p_descricao ILIKE '%RLM%'
      OR p_descricao ILIKE '%REDE LUCY MONTORO%'
      OR p_descricao ILIKE '%LUCY MONTORO%'
      OR p_descricao ILIKE '%INST. REAB. LUCY%'               THEN 'REDE LUCY MONTORO'

    -- ── HC – Hospitais das Clínicas (identificáveis por descrição) ────
    WHEN p_descricao ILIKE '%HCFAMEMA%'
      OR p_descricao ILIKE '%FAMEMA%'                          THEN 'HCFAMEMA'
    WHEN p_descricao ILIKE '%NAOR BOTUCATU%'
      OR p_descricao ILIKE '%HCBOTUCATU%'                      THEN 'HCBOTUCATU'
    WHEN p_descricao ILIKE '%HCSP%'
      OR p_descricao ILIKE '%HC SAO PAULO%'
      OR p_descricao ILIKE '%HC DE SAO PAULO%'                 THEN 'HCSP'
    WHEN p_descricao ILIKE '%HCRIBEIRAO%'
      OR p_descricao ILIKE '%HC RIBEIRAO%'
      OR p_descricao ILIKE '%HCFMRP%'                          THEN 'HCRIBEIRÃO'

    -- ── AUTARQUIA (identificáveis por descrição) ──────────────────────
    WHEN p_descricao ILIKE '%HEMOCENTRO%'                      THEN 'AUTARQUIA - HEMOCENTRO'
    WHEN p_descricao ILIKE '%FURP%'                            THEN 'AUTARQUIA - FURP'
    WHEN p_descricao ILIKE '%ONCOCENT%'                        THEN 'AUTARQUIA - ONCOCENTRO'

    -- ── GESTÃO ESTADUAL ───────────────────────────────────────────────
    WHEN p_descricao ILIKE '%GESTAO ESTADUAL%'
      OR p_descricao ILIKE '%GESTÃO ESTADUAL%'
      OR p_descricao ILIKE '%GESTAO PLENA%'                    THEN 'GESTÃO ESTADUAL'

    -- ── CONVÊNIO ──────────────────────────────────────────────────────
    WHEN p_descricao ILIKE '%CONVENIO%'
      OR p_descricao ILIKE '%CONVÊNIO%'
      OR p_descricao ILIKE '%CONVENÇÃO%'                       THEN 'CONVÊNIO'

    -- ── EMENDA PARLAMENTAR ────────────────────────────────────────────
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
      OR p_descricao ILIKE '%HC - UNICAMP%'                    THEN 'EMENDA'

    -- ── PPP ───────────────────────────────────────────────────────────
    WHEN p_descricao ILIKE '%PEROLA BYINGTON%'
      OR p_descricao ILIKE '%PPP DESEQUILIBRIO%'               THEN 'PPP'

    -- ── CIRURGIAS ELETIVAS ────────────────────────────────────────────
    WHEN p_descricao ILIKE '%CORUJAO%'
      OR p_descricao ILIKE '%CIRURGIA ELETIVA%'
      OR p_descricao ILIKE '%MUTIRAO CIRURGIA%'
      OR p_descricao ILIKE '%PAGAMENTO DE CIRURGIAS ELETIVAS%'
      OR p_descricao ILIKE '%CUSTEIO / CORUJAO%'               THEN 'CIRURGIAS ELETIVAS'

    -- ── PISO ENFERMAGEM ───────────────────────────────────────────────
    WHEN p_descricao ILIKE '%PISO ENFERM%'
      OR p_descricao ILIKE '%PISO DA ENFERM%'
      OR p_descricao ILIKE '%REAJUSTE PISO%'
      OR p_descricao ILIKE '%PAGAMENTO PISO ENFERMAGEM%'
      OR p_descricao ILIKE '%PISO SALARIAL DA ENFERMAGEM%'
      OR p_descricao ILIKE '%RESOLUCAO SS 124%'
      OR p_descricao ILIKE '%RESOLUCAO SS N. 124%'             THEN 'PISO ENFERMAGEM'

    -- ── CASAS DE APOIO ────────────────────────────────────────────────
    WHEN p_descricao ILIKE '%CASAS DE APOIO%'                  THEN 'CASAS DE APOIO'

    -- ── AEDES AEGYPTI ────────────────────────────────────────────────
    WHEN p_descricao ILIKE '%AEDES AEGYPTI%'                   THEN 'AEDES AEGYPTI'

    -- ── SISTEMA PRISIONAL ─────────────────────────────────────────────
    WHEN p_descricao ILIKE '%SISTEMA PRISIONAL%'               THEN 'SISTEMA PRISIONAL'

    -- ── AÇÃO CIVIL BAURU ──────────────────────────────────────────────
    WHEN (p_descricao ILIKE '%ACAO CIVIL%' OR p_descricao ILIKE '%AÇÃO CIVIL%')
      AND p_descricao ILIKE '%BAURU%'                          THEN 'AÇÃO CIVIL - BAURU'

    -- ── PROGRAMAS DE SAÚDE ────────────────────────────────────────────
    WHEN p_descricao ILIKE '%DOSE CERTA%'                      THEN 'DOSE CERTA'
    WHEN p_descricao ILIKE '%GLICEMIA%'                        THEN 'GLICEMIA'
    WHEN p_descricao ILIKE '%QUALIS MAIS%'                     THEN 'QUALIS MAIS'
    WHEN p_descricao ILIKE '%ATENCAO BASICA%'
      OR p_descricao ILIKE '%ATENÇÃO BÁSICA%'
      OR p_descricao ILIKE '%ATENÇÃO BASICA%'                  THEN 'ATENÇÃO BÁSICA'
    WHEN p_descricao ILIKE '%SORRIA SP%'                       THEN 'SORRIA SP'
    WHEN p_descricao ILIKE '%IGM SUS PAULISTA%'                THEN 'IGM SUS PAULISTA'
    WHEN p_descricao ILIKE '%TABELA SUS%'
      OR p_descricao ILIKE '%TABELASUS%'
      OR p_descricao ILIKE '%RESOLUCAO SS 164%'
      OR p_descricao ILIKE '%RESOLUCAO SS N. 164%'
      OR p_descricao ILIKE '%RESOLUCAO SS N. 198%'             THEN 'TABELA SUS PAULISTA'
    WHEN p_descricao ILIKE '%REPELENTE%'                       THEN 'REPELENTE'
    WHEN p_descricao ILIKE '% TEA'
      OR p_descricao ILIKE '%-TEA%'
      OR p_descricao ILIKE '%- TEA%'
      OR p_descricao ILIKE '%TEA %'
      OR p_descricao ILIKE '%TRATAMENTO TEA%'
      OR p_descricao ILIKE '%AUTISTA%'
      OR p_descricao ILIKE '%AMA-ASSOCIACAO%'
      OR p_descricao ILIKE '%ATENDIMENTO DE PACIENTES AUTISTA%'
      OR p_descricao ILIKE '%ASSOCIACAO DE AMIGOS DO AUTISTA%' THEN 'TEA'

    -- ── FALLBACK: usa tipo_despesa enriquecido do bd_ref ──────────────
    ELSE p_tipo

    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.classify_tipo_despesa(text, text) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.normalize_tipo_despesa_text(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canonicalize_tipo_despesa(text) TO anon, authenticated;


-- ───────────────────────────────────────────────────────────────
-- 1. lc131_dashboard
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lc131_dashboard(
  p_ano           integer DEFAULT NULL,
  p_drs           text    DEFAULT NULL,
  p_regiao_ad     text    DEFAULT NULL,
  p_rras          text    DEFAULT NULL,
  p_regiao_sa     text    DEFAULT NULL,
  p_municipio     text    DEFAULT NULL,
  p_grupo_despesa text    DEFAULT NULL,
  p_tipo_despesa  text    DEFAULT NULL,
  p_rotulo        text    DEFAULT NULL,
  p_fonte_recurso text    DEFAULT NULL,
  p_codigo_ug     text    DEFAULT NULL,
  p_uo            text    DEFAULT NULL,
  p_elemento      text    DEFAULT NULL,
  p_favorecido    text    DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public SET statement_timeout = 0
AS $$
DECLARE result json;
BEGIN
  WITH base AS (
    SELECT
      ano_referencia,
      drs, regiao_ad, rras, regiao_sa, municipio,
      codigo_nome_grupo, codigo_nome_fonte_recurso,
      codigo_nome_elemento, codigo_nome_uo, codigo_ug,
      rotulo,
      descricao_processo,
      codigo_nome_favorecido, codigo_nome_projeto_atividade,
      codigo_nome_ug,
      classify_tipo_despesa(descricao_processo, tipo_despesa) AS tipo_classif,
      COALESCE(empenhado, 0) AS empenhado,
      COALESCE(liquidado, 0) AS liquidado,
      COALESCE(pago, 0)      AS pago,
      COALESCE(pago, 0) + COALESCE(pago_anos_anteriores, 0) AS _pt,
      CASE
        WHEN LEFT(codigo_nome_grupo, 1) = '1' THEN 'Pessoal'
        WHEN LEFT(codigo_nome_grupo, 1) = '2' THEN 'Dívida'
        WHEN LEFT(codigo_nome_grupo, 1) = '3' THEN 'Custeio'
        WHEN LEFT(codigo_nome_grupo, 1) = '4' THEN 'Investimento'
        ELSE 'Outros'
      END AS _gs,
      CASE
        WHEN codigo_nome_fonte_recurso ILIKE '%tesouro%' THEN 'Tesouro'
        WHEN codigo_nome_fonte_recurso ILIKE '%fed%'
          OR codigo_nome_fonte_recurso ILIKE '%união%'
          OR codigo_nome_fonte_recurso ILIKE '%uniao%'
          OR codigo_nome_fonte_recurso ILIKE '%fundo nacional%'
          OR codigo_nome_fonte_recurso ILIKE '%transferência%'
          OR codigo_nome_fonte_recurso ILIKE '%transferencia%'
          OR codigo_nome_fonte_recurso ILIKE '%SUS%' THEN 'Federal'
        ELSE 'Demais Fontes'
      END AS _fs
    FROM lc131_despesas
    WHERE
      (p_ano IS NULL OR ano_referencia = p_ano)
      AND (p_drs           IS NULL OR drs                       = ANY(string_to_array(p_drs, '|')))
      AND (p_regiao_ad     IS NULL OR regiao_ad                 = ANY(string_to_array(p_regiao_ad, '|')))
      AND (p_rras          IS NULL OR rras                      = ANY(string_to_array(p_rras, '|')))
      AND (p_regiao_sa     IS NULL OR regiao_sa                 = ANY(string_to_array(p_regiao_sa, '|')))
      AND (p_municipio     IS NULL OR municipio                 = ANY(string_to_array(p_municipio, '|')))
      AND (p_grupo_despesa IS NULL OR codigo_nome_grupo         = ANY(string_to_array(p_grupo_despesa, '|')))
      AND (p_tipo_despesa  IS NULL OR classify_tipo_despesa(descricao_processo, tipo_despesa) = ANY(string_to_array(p_tipo_despesa, '|')))
      AND (p_rotulo        IS NULL OR rotulo                    = ANY(string_to_array(p_rotulo, '|')))
      AND (p_fonte_recurso IS NULL OR (
            CASE
              WHEN codigo_nome_fonte_recurso ILIKE '%tesouro%' THEN 'Tesouro'
              WHEN codigo_nome_fonte_recurso ILIKE '%fed%'
                OR codigo_nome_fonte_recurso ILIKE '%união%'
                OR codigo_nome_fonte_recurso ILIKE '%uniao%'
                OR codigo_nome_fonte_recurso ILIKE '%fundo nacional%'
                OR codigo_nome_fonte_recurso ILIKE '%transferência%'
                OR codigo_nome_fonte_recurso ILIKE '%transferencia%'
                OR codigo_nome_fonte_recurso ILIKE '%SUS%' THEN 'Federal'
              ELSE 'Demais Fontes'
            END) = ANY(string_to_array(p_fonte_recurso, '|')))
      AND (p_codigo_ug     IS NULL OR codigo_ug::text           = ANY(string_to_array(p_codigo_ug, '|')))
      AND (p_uo            IS NULL OR codigo_nome_uo            = ANY(string_to_array(p_uo, '|')))
      AND (p_elemento      IS NULL OR codigo_nome_elemento      = ANY(string_to_array(p_elemento, '|')))
      AND (p_favorecido    IS NULL OR codigo_nome_favorecido    = ANY(string_to_array(p_favorecido, '|')))
  )
  SELECT json_build_object(
    'kpis', (
      SELECT json_build_object(
        'empenhado',  SUM(empenhado),
        'liquidado',  SUM(liquidado),
        'pago',       SUM(pago),
        'pago_total', SUM(_pt),
        'total',      COUNT(*),
        'municipios', COUNT(DISTINCT NULLIF(municipio, ''))
      ) FROM base
    ),
    'por_ano', (
      SELECT json_agg(r ORDER BY r.ano) FROM (
        SELECT ano_referencia::int AS ano,
          SUM(empenhado) AS empenhado, SUM(liquidado) AS liquidado,
          SUM(pago) AS pago, SUM(_pt) AS pago_total, COUNT(*) AS registros
        FROM base WHERE ano_referencia IS NOT NULL GROUP BY ano_referencia
      ) r
    ),
    'por_grupo_simpl', (
      SELECT json_agg(r ORDER BY r.empenhado DESC) FROM (
        SELECT _gs AS grupo_simpl,
          SUM(empenhado) AS empenhado, SUM(liquidado) AS liquidado, SUM(_pt) AS pago_total
        FROM base WHERE codigo_nome_grupo IS NOT NULL AND codigo_nome_grupo<>''
        GROUP BY _gs
      ) r
    ),
    'por_fonte_simpl', (
      SELECT json_agg(r ORDER BY r.empenhado DESC) FROM (
        SELECT _fs AS fonte_simpl,
          SUM(empenhado) AS empenhado, SUM(liquidado) AS liquidado, SUM(_pt) AS pago_total
        FROM base WHERE codigo_nome_fonte_recurso IS NOT NULL AND codigo_nome_fonte_recurso<>''
        GROUP BY _fs
      ) r
    ),
    'por_grupo', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_grupo AS grupo_despesa,
          SUM(empenhado) AS empenhado, SUM(liquidado) AS liquidado, SUM(_pt) AS pago_total
        FROM base WHERE codigo_nome_grupo IS NOT NULL AND codigo_nome_grupo<>''
        GROUP BY codigo_nome_grupo ORDER BY 2 DESC LIMIT 12
      ) r
    ),
    'por_drs', (
      SELECT json_agg(r) FROM (
        SELECT drs,
          SUM(empenhado) AS empenhado, SUM(liquidado) AS liquidado, SUM(_pt) AS pago_total
        FROM base WHERE drs IS NOT NULL AND drs<>''
        GROUP BY drs ORDER BY 2 DESC LIMIT 20
      ) r
    ),
    'por_municipio', (
      SELECT json_agg(r) FROM (
        SELECT municipio,
          SUM(empenhado) AS empenhado, SUM(_pt) AS pago_total
        FROM base WHERE municipio IS NOT NULL AND municipio<>''
        GROUP BY municipio ORDER BY 2 DESC LIMIT 15
      ) r
    ),
    'por_fonte', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_fonte_recurso AS fonte_recurso,
          SUM(empenhado) AS empenhado, SUM(_pt) AS pago_total
        FROM base WHERE codigo_nome_fonte_recurso IS NOT NULL AND codigo_nome_fonte_recurso<>''
        GROUP BY codigo_nome_fonte_recurso ORDER BY 2 DESC LIMIT 12
      ) r
    ),
    'por_elemento', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_elemento AS elemento,
          SUM(empenhado) AS empenhado, SUM(_pt) AS pago_total
        FROM base WHERE codigo_nome_elemento IS NOT NULL AND codigo_nome_elemento<>''
        GROUP BY codigo_nome_elemento ORDER BY 2 DESC LIMIT 12
      ) r
    ),
    'por_regiao_ad', (
      SELECT json_agg(r) FROM (
        SELECT regiao_ad,
          SUM(empenhado) AS empenhado, SUM(_pt) AS pago_total
        FROM base WHERE regiao_ad IS NOT NULL AND regiao_ad<>''
        GROUP BY regiao_ad ORDER BY 2 DESC LIMIT 20
      ) r
    ),
    'por_uo', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_uo AS uo,
          SUM(empenhado) AS empenhado, SUM(liquidado) AS liquidado, SUM(_pt) AS pago_total
        FROM base WHERE codigo_nome_uo IS NOT NULL AND codigo_nome_uo<>''
        GROUP BY codigo_nome_uo ORDER BY 2 DESC LIMIT 15
      ) r
    ),
    'por_rras', (
      SELECT json_agg(r) FROM (
        SELECT rras,
          SUM(empenhado) AS empenhado, SUM(liquidado) AS liquidado, SUM(_pt) AS pago_total
        FROM base WHERE rras IS NOT NULL AND rras<>''
        GROUP BY rras ORDER BY 2 DESC LIMIT 20
      ) r
    ),
    'por_tipo_despesa', (
      SELECT json_agg(r) FROM (
        SELECT tipo_classif AS tipo_despesa,
          SUM(empenhado) AS empenhado, SUM(liquidado) AS liquidado, SUM(_pt) AS pago_total
        FROM base WHERE tipo_classif IS NOT NULL AND tipo_classif<>''
        GROUP BY tipo_classif ORDER BY 2 DESC LIMIT 60
      ) r
    ),
    'por_rotulo', (
      SELECT json_agg(r) FROM (
        SELECT rotulo,
          SUM(empenhado) AS empenhado, SUM(_pt) AS pago_total
        FROM base WHERE rotulo IS NOT NULL AND rotulo<>''
        GROUP BY rotulo ORDER BY 2 DESC LIMIT 12
      ) r
    ),
    'por_favorecido', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_favorecido AS favorecido,
          SUM(empenhado) AS empenhado, SUM(_pt) AS pago_total, COUNT(*) AS contratos
        FROM base WHERE codigo_nome_favorecido IS NOT NULL AND codigo_nome_favorecido<>''
        GROUP BY codigo_nome_favorecido ORDER BY 2 DESC LIMIT 20
      ) r
    ),
    'por_projeto', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_projeto_atividade AS projeto,
          SUM(empenhado) AS empenhado, SUM(_pt) AS pago_total, COUNT(*) AS registros
        FROM base WHERE codigo_nome_projeto_atividade IS NOT NULL AND codigo_nome_projeto_atividade<>''
        GROUP BY codigo_nome_projeto_atividade ORDER BY 2 DESC LIMIT 20
      ) r
    ),
    'por_ug', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_ug AS ug,
          SUM(empenhado) AS empenhado, SUM(_pt) AS pago_total
        FROM base WHERE codigo_nome_ug IS NOT NULL AND codigo_nome_ug<>''
        GROUP BY codigo_nome_ug ORDER BY 2 DESC LIMIT 15
      ) r
    ),
    'por_regiao_sa', (
      SELECT json_agg(r) FROM (
        SELECT regiao_sa,
          SUM(empenhado) AS empenhado, SUM(_pt) AS pago_total
        FROM base WHERE regiao_sa IS NOT NULL AND regiao_sa<>''
        GROUP BY regiao_sa ORDER BY 2 DESC LIMIT 20
      ) r
    )
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lc131_dashboard(integer,text,text,text,text,text,text,text,text,text,text,text,text,text) TO anon, authenticated;


-- ───────────────────────────────────────────────────────────────
-- 2. lc131_distincts
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lc131_distincts(
  p_ano           integer DEFAULT NULL,
  p_drs           text    DEFAULT NULL,
  p_regiao_ad     text    DEFAULT NULL,
  p_rras          text    DEFAULT NULL,
  p_regiao_sa     text    DEFAULT NULL,
  p_municipio     text    DEFAULT NULL,
  p_grupo_despesa text    DEFAULT NULL,
  p_tipo_despesa  text    DEFAULT NULL,
  p_rotulo        text    DEFAULT NULL,
  p_fonte_recurso text    DEFAULT NULL,
  p_codigo_ug     text    DEFAULT NULL,
  p_uo            text    DEFAULT NULL,
  p_elemento      text    DEFAULT NULL,
  p_favorecido    text    DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public SET statement_timeout = 0
AS $$
DECLARE result json;
BEGIN
  WITH filtered AS (
    SELECT drs, regiao_ad, rras, regiao_sa, municipio,
           codigo_nome_grupo, rotulo,
           descricao_processo,
           tipo_despesa,
           classify_tipo_despesa(descricao_processo, tipo_despesa) AS tipo_classif,
           codigo_nome_fonte_recurso, codigo_ug,
           codigo_nome_uo, codigo_nome_elemento,
           codigo_nome_favorecido
    FROM lc131_despesas
    WHERE
      (p_ano IS NULL OR ano_referencia = p_ano)
      AND (p_drs           IS NULL OR drs                       = ANY(string_to_array(p_drs, '|')))
      AND (p_regiao_ad     IS NULL OR regiao_ad                 = ANY(string_to_array(p_regiao_ad, '|')))
      AND (p_rras          IS NULL OR rras                      = ANY(string_to_array(p_rras, '|')))
      AND (p_regiao_sa     IS NULL OR regiao_sa                 = ANY(string_to_array(p_regiao_sa, '|')))
      AND (p_municipio     IS NULL OR municipio                 = ANY(string_to_array(p_municipio, '|')))
      AND (p_grupo_despesa IS NULL OR codigo_nome_grupo         = ANY(string_to_array(p_grupo_despesa, '|')))
      AND (p_tipo_despesa  IS NULL OR classify_tipo_despesa(descricao_processo, tipo_despesa) = ANY(string_to_array(p_tipo_despesa, '|')))
      AND (p_rotulo        IS NULL OR rotulo                    = ANY(string_to_array(p_rotulo, '|')))
      AND (p_fonte_recurso IS NULL OR (
            CASE
              WHEN codigo_nome_fonte_recurso ILIKE '%tesouro%' THEN 'Tesouro'
              WHEN codigo_nome_fonte_recurso ILIKE '%fed%'
                OR codigo_nome_fonte_recurso ILIKE '%união%'
                OR codigo_nome_fonte_recurso ILIKE '%uniao%'
                OR codigo_nome_fonte_recurso ILIKE '%fundo nacional%'
                OR codigo_nome_fonte_recurso ILIKE '%transferência%'
                OR codigo_nome_fonte_recurso ILIKE '%transferencia%'
                OR codigo_nome_fonte_recurso ILIKE '%SUS%' THEN 'Federal'
              ELSE 'Demais Fontes'
            END) = ANY(string_to_array(p_fonte_recurso, '|')))
      AND (p_codigo_ug     IS NULL OR codigo_ug::text           = ANY(string_to_array(p_codigo_ug, '|')))
      AND (p_uo            IS NULL OR codigo_nome_uo            = ANY(string_to_array(p_uo, '|')))
      AND (p_elemento      IS NULL OR codigo_nome_elemento      = ANY(string_to_array(p_elemento, '|')))
      AND (p_favorecido    IS NULL OR codigo_nome_favorecido    = ANY(string_to_array(p_favorecido, '|')))
  )
  SELECT json_build_object(
    'distinct_drs',        (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT drs                       AS d FROM filtered WHERE drs IS NOT NULL AND drs<>'') x),
    'distinct_regiao_ad',  (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT regiao_ad                 AS d FROM filtered WHERE regiao_ad IS NOT NULL AND regiao_ad<>'') x),
    'distinct_rras',       (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT rras                      AS d FROM filtered WHERE rras IS NOT NULL AND rras<>'') x),
    'distinct_regiao_sa',  (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT regiao_sa                 AS d FROM filtered WHERE regiao_sa IS NOT NULL AND regiao_sa<>'') x),
    'distinct_municipio',  (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT municipio                 AS d FROM filtered WHERE municipio IS NOT NULL AND municipio<>'') x),
    'distinct_grupo',      (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT codigo_nome_grupo         AS d FROM filtered WHERE codigo_nome_grupo IS NOT NULL AND codigo_nome_grupo<>'') x),
    'distinct_tipo',       (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT tipo_classif              AS d FROM filtered WHERE tipo_classif IS NOT NULL AND tipo_classif<>'') x),
    'distinct_rotulo',     (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT rotulo                    AS d FROM filtered WHERE rotulo IS NOT NULL AND rotulo<>'') x),
    'distinct_fonte',      (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT
                              CASE
                                WHEN codigo_nome_fonte_recurso ILIKE '%tesouro%' THEN 'Tesouro'
                                WHEN codigo_nome_fonte_recurso ILIKE '%fed%'
                                  OR codigo_nome_fonte_recurso ILIKE '%união%'
                                  OR codigo_nome_fonte_recurso ILIKE '%uniao%'
                                  OR codigo_nome_fonte_recurso ILIKE '%fundo nacional%'
                                  OR codigo_nome_fonte_recurso ILIKE '%transferência%'
                                  OR codigo_nome_fonte_recurso ILIKE '%transferencia%'
                                  OR codigo_nome_fonte_recurso ILIKE '%SUS%' THEN 'Federal'
                                ELSE 'Demais Fontes'
                              END AS d
                            FROM filtered WHERE codigo_nome_fonte_recurso IS NOT NULL AND codigo_nome_fonte_recurso<>'') x),
    'distinct_codigo_ug',  (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT codigo_ug::text           AS d FROM filtered WHERE codigo_ug IS NOT NULL) x),
    'distinct_uo',         (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT codigo_nome_uo            AS d FROM filtered WHERE codigo_nome_uo IS NOT NULL AND codigo_nome_uo<>'') x),
    'distinct_elemento',   (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT codigo_nome_elemento      AS d FROM filtered WHERE codigo_nome_elemento IS NOT NULL AND codigo_nome_elemento<>'') x),
    'distinct_favorecido', (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT codigo_nome_favorecido    AS d FROM filtered WHERE codigo_nome_favorecido IS NOT NULL AND codigo_nome_favorecido<>'') x)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lc131_distincts(integer,text,text,text,text,text,text,text,text,text,text,text,text,text) TO anon, authenticated;


-- ───────────────────────────────────────────────────────────────
-- 3. lc131_detail
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lc131_detail(
  p_ano           integer DEFAULT NULL,
  p_drs           text    DEFAULT NULL,
  p_regiao_ad     text    DEFAULT NULL,
  p_rras          text    DEFAULT NULL,
  p_regiao_sa     text    DEFAULT NULL,
  p_municipio     text    DEFAULT NULL,
  p_grupo_despesa text    DEFAULT NULL,
  p_tipo_despesa  text    DEFAULT NULL,
  p_rotulo        text    DEFAULT NULL,
  p_fonte_recurso text    DEFAULT NULL,
  p_codigo_ug     text    DEFAULT NULL,
  p_uo            text    DEFAULT NULL,
  p_elemento      text    DEFAULT NULL,
  p_favorecido    text    DEFAULT NULL,
  p_limit         integer DEFAULT 200,
  p_offset        integer DEFAULT 0
)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public SET statement_timeout = 0
AS $$
DECLARE result json;
BEGIN
  WITH filtered AS (
    SELECT *,
           COALESCE(pago, 0) + COALESCE(pago_anos_anteriores, 0) AS _pt,
           classify_tipo_despesa(descricao_processo, tipo_despesa) AS tipo_classif,
           CASE
             WHEN codigo_nome_fonte_recurso ILIKE '%tesouro%' THEN 'Tesouro'
             WHEN codigo_nome_fonte_recurso ILIKE '%fed%'
               OR codigo_nome_fonte_recurso ILIKE '%união%'
               OR codigo_nome_fonte_recurso ILIKE '%uniao%'
               OR codigo_nome_fonte_recurso ILIKE '%fundo nacional%'
               OR codigo_nome_fonte_recurso ILIKE '%transferência%'
               OR codigo_nome_fonte_recurso ILIKE '%transferencia%'
               OR codigo_nome_fonte_recurso ILIKE '%SUS%' THEN 'Federal'
             ELSE 'Demais Fontes'
           END AS fonte_simpl,
           CASE
             WHEN LEFT(codigo_nome_grupo, 1) = '1' THEN 'Pessoal'
             WHEN LEFT(codigo_nome_grupo, 1) = '2' THEN 'Dívida'
             WHEN LEFT(codigo_nome_grupo, 1) = '3' THEN 'Custeio'
             WHEN LEFT(codigo_nome_grupo, 1) = '4' THEN 'Investimento'
             ELSE 'Outros'
           END AS grupo_simpl
    FROM lc131_despesas
    WHERE
      (p_ano IS NULL OR ano_referencia = p_ano)
      AND (p_drs           IS NULL OR drs                       = ANY(string_to_array(p_drs, '|')))
      AND (p_regiao_ad     IS NULL OR regiao_ad                 = ANY(string_to_array(p_regiao_ad, '|')))
      AND (p_rras          IS NULL OR rras                      = ANY(string_to_array(p_rras, '|')))
      AND (p_regiao_sa     IS NULL OR regiao_sa                 = ANY(string_to_array(p_regiao_sa, '|')))
      AND (p_municipio     IS NULL OR municipio                 = ANY(string_to_array(p_municipio, '|')))
      AND (p_grupo_despesa IS NULL OR codigo_nome_grupo         = ANY(string_to_array(p_grupo_despesa, '|')))
      AND (p_tipo_despesa  IS NULL OR classify_tipo_despesa(descricao_processo, tipo_despesa) = ANY(string_to_array(p_tipo_despesa, '|')))
      AND (p_rotulo        IS NULL OR rotulo                    = ANY(string_to_array(p_rotulo, '|')))
      AND (p_fonte_recurso IS NULL OR (
            CASE
              WHEN codigo_nome_fonte_recurso ILIKE '%tesouro%' THEN 'Tesouro'
              WHEN codigo_nome_fonte_recurso ILIKE '%fed%'
                OR codigo_nome_fonte_recurso ILIKE '%união%'
                OR codigo_nome_fonte_recurso ILIKE '%uniao%'
                OR codigo_nome_fonte_recurso ILIKE '%fundo nacional%'
                OR codigo_nome_fonte_recurso ILIKE '%transferência%'
                OR codigo_nome_fonte_recurso ILIKE '%transferencia%'
                OR codigo_nome_fonte_recurso ILIKE '%SUS%' THEN 'Federal'
              ELSE 'Demais Fontes'
            END) = ANY(string_to_array(p_fonte_recurso, '|')))
      AND (p_codigo_ug     IS NULL OR codigo_ug::text           = ANY(string_to_array(p_codigo_ug, '|')))
      AND (p_uo            IS NULL OR codigo_nome_uo            = ANY(string_to_array(p_uo, '|')))
      AND (p_elemento      IS NULL OR codigo_nome_elemento      = ANY(string_to_array(p_elemento, '|')))
      AND (p_favorecido    IS NULL OR codigo_nome_favorecido    = ANY(string_to_array(p_favorecido, '|')))
  )
  SELECT json_build_object(
    'total', (SELECT COUNT(*) FROM filtered),
    'rows',  (
      SELECT json_agg(r) FROM (
        SELECT
          id, ano_referencia,
          drs, regiao_ad, rras, regiao_sa, cod_ibge, municipio,
          codigo_nome_uo, codigo_nome_ug, codigo_ug,
          codigo_nome_projeto_atividade, codigo_projeto_atividade,
          codigo_nome_fonte_recurso, fonte_recurso, fonte_simpl,
          codigo_nome_grupo, grupo_despesa, grupo_simpl,
          codigo_nome_elemento, codigo_elemento,
          tipo_classif AS tipo_despesa, rotulo,
          unidade,
          codigo_nome_favorecido, codigo_favorecido,
          descricao_processo, numero_processo,
          empenhado, liquidado, pago, pago_anos_anteriores, _pt AS pago_total
        FROM filtered
        ORDER BY empenhado DESC NULLS LAST
        LIMIT p_limit OFFSET p_offset
      ) r
    )
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lc131_detail(integer,text,text,text,text,text,text,text,text,text,text,text,text,text,integer,integer) TO anon, authenticated;


-- Recarregar schema do PostgREST
NOTIFY pgrst, 'reload schema';
