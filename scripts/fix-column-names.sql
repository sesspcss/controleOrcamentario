-- ================================================================
-- FIX: Corrigir nomes de colunas e comentários em TODAS as tabelas
-- Execute no SQL Editor do Supabase
-- ================================================================

-- ================================================================
-- PASSO 1: Verificar colunas atuais (resultado aparece em "Results")
-- ================================================================
SELECT 
  table_name, 
  column_name, 
  data_type,
  col_description(
    (table_schema || '.' || table_name)::regclass, 
    ordinal_position
  ) AS column_comment
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('lc131_despesas', 'bd_ref', 'tab_drs', 'tab_rras')
ORDER BY table_name, ordinal_position;


-- ================================================================
-- PASSO 2: Remover QUALQUER comentário "médicos" das colunas
-- ================================================================

-- Limpa todos os comentários indesejados em tab_drs
COMMENT ON COLUMN public.tab_drs.municipio IS NULL;
COMMENT ON COLUMN public.tab_drs.drs IS NULL;

-- Limpa comentários em tab_rras
COMMENT ON COLUMN public.tab_rras.municipio IS NULL;
COMMENT ON COLUMN public.tab_rras.rras IS NULL;


-- ================================================================
-- PASSO 3: Se existe coluna "medicos" em tab_drs, renomear para "drs"
-- ================================================================

-- Verifica se a coluna "medicos" existe e renomeia
DO $$
BEGIN
  -- Caso 1: existe "medicos" mas NÃO existe "drs" → renomear
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tab_drs' AND column_name = 'medicos'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tab_drs' AND column_name = 'drs'
  ) THEN
    ALTER TABLE public.tab_drs RENAME COLUMN medicos TO drs;
    RAISE NOTICE 'tab_drs: coluna "medicos" renomeada para "drs"';
  
  -- Caso 2: existem AMBAS "medicos" e "drs" → dropar "medicos" (duplicata)
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tab_drs' AND column_name = 'medicos'
  ) THEN
    ALTER TABLE public.tab_drs DROP COLUMN medicos;
    RAISE NOTICE 'tab_drs: coluna duplicada "medicos" removida (já existe "drs")';
  
  ELSE
    RAISE NOTICE 'tab_drs: OK — coluna "drs" já existe, nenhuma "medicos" encontrada';
  END IF;
END $$;


-- ================================================================
-- PASSO 4: Garantir estrutura correta de TODAS as tabelas
-- ================================================================

-- tab_drs: deve ter exatamente (municipio TEXT PK, drs TEXT NOT NULL)
DO $$
BEGIN
  -- Verificar se "drs" existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tab_drs' AND column_name = 'drs'
  ) THEN
    RAISE EXCEPTION 'ERRO CRÍTICO: tab_drs não tem coluna "drs"!';
  END IF;
  
  -- Verificar se "municipio" existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tab_drs' AND column_name = 'municipio'
  ) THEN
    RAISE EXCEPTION 'ERRO CRÍTICO: tab_drs não tem coluna "municipio"!';
  END IF;
  
  RAISE NOTICE 'tab_drs: estrutura OK (municipio, drs)';
END $$;

-- tab_rras: deve ter exatamente (municipio TEXT PK, rras TEXT NOT NULL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tab_rras' AND column_name = 'rras'
  ) THEN
    RAISE EXCEPTION 'ERRO CRÍTICO: tab_rras não tem coluna "rras"!';
  END IF;
  
  RAISE NOTICE 'tab_rras: estrutura OK (municipio, rras)';
END $$;


-- ================================================================
-- PASSO 5: Verificar colunas EXTRAS indesejadas em todas as tabelas
-- ================================================================

DO $$
DECLARE
  rec RECORD;
  expected_cols TEXT[];
  actual_col TEXT;
  bad_cols TEXT := '';
BEGIN
  -- tab_drs: colunas esperadas
  FOR rec IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tab_drs'
      AND column_name NOT IN ('municipio', 'drs')
  LOOP
    bad_cols := bad_cols || 'tab_drs.' || rec.column_name || ', ';
  END LOOP;
  
  -- tab_rras: colunas esperadas
  FOR rec IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tab_rras'
      AND column_name NOT IN ('municipio', 'rras')
  LOOP
    bad_cols := bad_cols || 'tab_rras.' || rec.column_name || ', ';
  END LOOP;

  -- bd_ref: colunas esperadas
  FOR rec IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bd_ref'
      AND column_name NOT IN ('id', 'codigo', 'unidade', 'drs', 'regiao_ad', 'rras', 
                              'regiao_sa', 'cod_ibge', 'municipio', 'fonte_recurso', 
                              'grupo_despesa', 'tipo_despesa', 'rotulo')
  LOOP
    bad_cols := bad_cols || 'bd_ref.' || rec.column_name || ', ';
  END LOOP;
  
  -- lc131_despesas: colunas esperadas
  FOR rec IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lc131_despesas'
      AND column_name NOT IN ('id', 'ano_referencia', 'nome_municipio', 'municipio',
                              'codigo_nome_uo', 'codigo_ug', 'codigo_nome_ug',
                              'codigo_projeto_atividade', 'codigo_nome_projeto_atividade',
                              'codigo_nome_fonte_recurso', 'codigo_fonte_recursos', 'fonte_recurso',
                              'codigo_nome_grupo', 'grupo_despesa', 'codigo_nome_elemento',
                              'codigo_elemento', 'codigo_nome_favorecido', 'codigo_favorecido',
                              'descricao_processo', 'numero_processo',
                              'empenhado', 'liquidado', 'pago', 'pago_anos_anteriores', 'pago_total',
                              'drs', 'regiao_ad', 'rras', 'regiao_sa', 'cod_ibge',
                              'unidade', 'rotulo', 'tipo_despesa')
  LOOP
    bad_cols := bad_cols || 'lc131_despesas.' || rec.column_name || ', ';
  END LOOP;

  IF bad_cols <> '' THEN
    RAISE WARNING 'Colunas EXTRAS encontradas: %', bad_cols;
  ELSE
    RAISE NOTICE 'Nenhuma coluna extra indesejada encontrada em nenhuma tabela';
  END IF;
END $$;


-- ================================================================
-- PASSO 6: Definir comentários CORRETOS (labels no Table Editor)
-- ================================================================

COMMENT ON COLUMN public.tab_drs.municipio IS 'Nome do município (normalizado UPPER sem acentos)';
COMMENT ON COLUMN public.tab_drs.drs IS 'Departamento Regional de Saúde';

COMMENT ON COLUMN public.tab_rras.municipio IS 'Nome do município (normalizado UPPER sem acentos)';
COMMENT ON COLUMN public.tab_rras.rras IS 'Rede Regional de Atenção à Saúde';

COMMENT ON COLUMN public.bd_ref.codigo IS 'Código do projeto/atividade ou UG (6 dígitos)';
COMMENT ON COLUMN public.bd_ref.unidade IS 'Nome da unidade de saúde';
COMMENT ON COLUMN public.bd_ref.drs IS 'Departamento Regional de Saúde';
COMMENT ON COLUMN public.bd_ref.rras IS 'RRAS - Rede Regional de Atenção à Saúde';
COMMENT ON COLUMN public.bd_ref.municipio IS 'Nome do município';
COMMENT ON COLUMN public.bd_ref.rotulo IS 'Rótulo de classificação da despesa';

COMMENT ON COLUMN public.lc131_despesas.drs IS 'Departamento Regional de Saúde';
COMMENT ON COLUMN public.lc131_despesas.rras IS 'RRAS - Rede Regional de Atenção à Saúde';
COMMENT ON COLUMN public.lc131_despesas.municipio IS 'Nome do município';
COMMENT ON COLUMN public.lc131_despesas.rotulo IS 'Rótulo de classificação da despesa';
COMMENT ON COLUMN public.lc131_despesas.descricao_processo IS 'Descrição do processo de despesa';
COMMENT ON COLUMN public.lc131_despesas.numero_processo IS 'Número do processo administrativo';


-- ================================================================
-- PASSO 7: Verificação final — lista todas as colunas e comentários
-- ================================================================

SELECT 
  table_name AS tabela,
  column_name AS coluna,
  data_type AS tipo,
  col_description(
    (table_schema || '.' || table_name)::regclass, 
    ordinal_position
  ) AS comentario
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('lc131_despesas', 'bd_ref', 'tab_drs', 'tab_rras')
ORDER BY table_name, ordinal_position;


-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
