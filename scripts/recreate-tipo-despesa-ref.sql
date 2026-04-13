-- ================================================================
-- PASSO 1: Recriar tabela tipo_despesa_ref
-- (foi removida pelo apply-tipo-categorias-01-base.sql)
-- Executar ANTES de rodar import-tipo-despesa.ts
-- ================================================================

CREATE TABLE IF NOT EXISTS public.tipo_despesa_ref (
  descricao_processo_norm    TEXT        NOT NULL,
  descricao_processo_exemplo TEXT,
  tipo_despesa               TEXT,
  ocorrencias                INTEGER,
  atualizado_em              TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT tipo_despesa_ref_pkey PRIMARY KEY (descricao_processo_norm)
);

ALTER TABLE public.tipo_despesa_ref ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon select tipo_despesa_ref" ON public.tipo_despesa_ref;
CREATE POLICY "anon select tipo_despesa_ref"
  ON public.tipo_despesa_ref FOR SELECT TO anon USING (true);

GRANT SELECT, INSERT, UPDATE ON public.tipo_despesa_ref TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
