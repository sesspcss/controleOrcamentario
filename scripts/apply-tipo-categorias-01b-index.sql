SET statement_timeout = 0;

CREATE INDEX IF NOT EXISTS idx_lc131_tipo_despesa_classif
  ON public.lc131_despesas (tipo_despesa_classif);

ANALYZE public.lc131_despesas;

NOTIFY pgrst, 'reload schema';
