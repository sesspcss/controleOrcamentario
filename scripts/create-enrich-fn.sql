-- ================================================================
-- Criar função RPC que executa o enriquecimento server-side
-- Execute este script NO SUPABASE SQL EDITOR (é só DDL, sem dados)
-- ================================================================

-- Função auxiliar de normalização (criada separadamente para reutilização)
CREATE OR REPLACE FUNCTION public.norm_tipo_desc(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT upper(trim(regexp_replace(
    translate(p,
      'áàãâäéèêëíìîïóòõôöúùûüçÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ',
      'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'),
    '\s+', ' ', 'g')))
$$;

-- Processa UM lote por chamada (sem loop interno) para evitar timeout HTTP 504
CREATE OR REPLACE FUNCTION public.enrich_tipo_despesa_batch(p_batch_size integer DEFAULT 5000)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = 0
AS $$
DECLARE
  updated_count INTEGER := 0;
BEGIN
  WITH to_update AS (
    SELECT d.id, tdr.tipo_despesa
    FROM lc131_despesas d
    INNER JOIN tipo_despesa_ref tdr
      ON norm_tipo_desc(d.descricao_processo) = tdr.descricao_processo_norm
    WHERE (d.tipo_despesa IS NULL OR d.tipo_despesa = '' OR d.tipo_despesa IS DISTINCT FROM tdr.tipo_despesa)
      AND tdr.tipo_despesa IS NOT NULL
      AND tdr.tipo_despesa <> ''
    LIMIT p_batch_size
  )
  UPDATE lc131_despesas d
  SET tipo_despesa = to_update.tipo_despesa
  FROM to_update
  WHERE d.id = to_update.id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  RETURN json_build_object('updated', updated_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.enrich_tipo_despesa_batch(integer) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
