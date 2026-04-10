-- ================================================================
-- DEPLOY INDEXES — Executar DEPOIS de importar todos os dados
-- Execute no SQL Editor do Supabase
-- ================================================================

-- Índice composto para filtros mais comuns
CREATE INDEX IF NOT EXISTS idx_lc131_ano ON public.lc131_despesas (ano_referencia);
CREATE INDEX IF NOT EXISTS idx_lc131_cod_projeto ON public.lc131_despesas (codigo_projeto_atividade);
CREATE INDEX IF NOT EXISTS idx_lc131_cod_ug ON public.lc131_despesas (codigo_ug);
CREATE INDEX IF NOT EXISTS idx_lc131_nome_municipio ON public.lc131_despesas (nome_municipio);
CREATE INDEX IF NOT EXISTS idx_lc131_empenhado ON public.lc131_despesas (empenhado DESC NULLS LAST);

-- Índices para enriquecimento (refresh_dashboard_batch)
CREATE INDEX IF NOT EXISTS idx_lc131_drs ON public.lc131_despesas (drs);
CREATE INDEX IF NOT EXISTS idx_lc131_rras ON public.lc131_despesas (rras);
CREATE INDEX IF NOT EXISTS idx_lc131_regiao_ad ON public.lc131_despesas (regiao_ad);
CREATE INDEX IF NOT EXISTS idx_lc131_rotulo ON public.lc131_despesas (rotulo);
CREATE INDEX IF NOT EXISTS idx_lc131_municipio ON public.lc131_despesas (municipio);
CREATE INDEX IF NOT EXISTS idx_lc131_tipo_despesa ON public.lc131_despesas (tipo_despesa);

-- Índice para JOIN 3 (prefixo numérico do codigo_nome_ug)
CREATE INDEX IF NOT EXISTS idx_lc131_cod_nome_ug_prefix
  ON public.lc131_despesas (
    NULLIF(regexp_replace(split_part(codigo_nome_ug::text, ' ', 1), '[^0-9]', '', 'g'), '')
  );

-- Índice composto para dashboard (ano + empenhado)
CREATE INDEX IF NOT EXISTS idx_lc131_ano_empenhado
  ON public.lc131_despesas (ano_referencia, empenhado DESC NULLS LAST);

-- ANALYZE para atualizar estatísticas do planejador de consultas
ANALYZE public.lc131_despesas;
ANALYZE public.bd_ref;
ANALYZE public.tab_drs;
ANALYZE public.tab_rras;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
