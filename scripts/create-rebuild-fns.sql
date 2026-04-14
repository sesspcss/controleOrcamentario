-- ================================================================
-- FUNÇÕES PARA RECONSTRUÇÃO DA TABELA (substitui VACUUM FULL)
-- Execute TODO este script de uma vez no SQL Editor
-- ================================================================

-- 1. Cria tabela de staging (sem índices p/ INSERT rápido)
CREATE OR REPLACE FUNCTION public.rebuild_lc131_init()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DROP TABLE IF EXISTS public.lc131_despesas_staging;
  CREATE TABLE public.lc131_despesas_staging
    (LIKE public.lc131_despesas);           -- copia colunas + constraints, sem índices
  RETURN json_build_object('status', 'staging criada');
END;
$$;

-- 2. Copia um lote da tabela original para staging
CREATE OR REPLACE FUNCTION public.rebuild_lc131_batch(
  p_offset bigint  DEFAULT 0,
  p_limit  integer DEFAULT 10000
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  copied_count integer;
BEGIN
  INSERT INTO public.lc131_despesas_staging
  SELECT * FROM public.lc131_despesas
  ORDER BY id
  LIMIT p_limit OFFSET p_offset;

  GET DIAGNOSTICS copied_count = ROW_COUNT;
  RETURN json_build_object('copied', copied_count, 'offset', p_offset);
END;
$$;

-- 3. TRUNCATE original + re-insert do staging + limpa staging
--    TRUNCATE libera o espaço imediatamente (dead tuples eliminados)
--    INSERT é server-side (sem transferência de rede) → rápido
CREATE OR REPLACE FUNCTION public.rebuild_lc131_finish()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rebuilt_count bigint;
  max_id        bigint;
BEGIN
  SELECT COUNT(*), MAX(id) INTO rebuilt_count, max_id
  FROM public.lc131_despesas_staging;

  -- Libera espaço de dead tuples instantaneamente
  TRUNCATE TABLE public.lc131_despesas RESTART IDENTITY;

  -- Re-insere todos os dados (cópia server-side, ~460k rows ≈ 2-5s)
  INSERT INTO public.lc131_despesas
  SELECT * FROM public.lc131_despesas_staging;

  -- Corrige a sequence para o próximo INSERT
  IF max_id IS NOT NULL THEN
    PERFORM setval(
      pg_get_serial_sequence('public.lc131_despesas', 'id'),
      max_id
    );
  END IF;

  DROP TABLE public.lc131_despesas_staging;

  RETURN json_build_object('status', 'concluido', 'rows', rebuilt_count);
END;
$$;

SELECT 'Funções de rebuild criadas com sucesso' AS status;
