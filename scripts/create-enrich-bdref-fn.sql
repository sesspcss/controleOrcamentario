-- ================================================================
-- Enriquece rotulo, unidade e tipo_despesa (fallback) em lc131_despesas
-- a partir de bd_ref, usando a mesma lógica de JOIN da view lc131_enriquecida:
--   1º: codigo_projeto_atividade → bd_ref.codigo
--   2º: codigo_ug → bd_ref.codigo
--   3º: prefixo numérico de codigo_nome_ug → bd_ref.codigo
--
-- Execute no Supabase SQL Editor, depois rode: node scripts/run-enrich-bdref.mjs
-- ================================================================

CREATE OR REPLACE FUNCTION public.enrich_bdref_batch(
  p_batch_size integer DEFAULT 1000
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  -- Usa apenas codigo_projeto_atividade → bd_ref (índice único, rápido)
  -- Faz um UPDATE direto sem CTE para minimizar overhead
  UPDATE public.lc131_despesas lc
  SET
    unidade      = COALESCE(lc.unidade,      rb.unidade),
    rotulo       = COALESCE(lc.rotulo,       rb.rotulo),
    tipo_despesa = COALESCE(lc.tipo_despesa, rb.tipo_despesa)
  FROM (
    SELECT lc2.id,
           rb.unidade,
           rb.rotulo,
           rb.tipo_despesa
    FROM public.lc131_despesas lc2
    JOIN public.bd_ref rb
      ON rb.codigo = lc2.codigo_projeto_atividade::text
    WHERE (lc2.unidade IS NULL OR lc2.rotulo IS NULL OR lc2.tipo_despesa IS NULL)
      AND (rb.unidade IS NOT NULL OR rb.rotulo IS NOT NULL OR rb.tipo_despesa IS NOT NULL)
    LIMIT p_batch_size
  ) rb
  WHERE lc.id = rb.id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  -- Se ainda sobrar linhas com NULL, tenta via codigo_ug (segunda passagem)
  IF updated_count = 0 THEN
    UPDATE public.lc131_despesas lc
    SET
      unidade      = COALESCE(lc.unidade,      rb.unidade),
      rotulo       = COALESCE(lc.rotulo,       rb.rotulo),
      tipo_despesa = COALESCE(lc.tipo_despesa, rb.tipo_despesa)
    FROM (
      SELECT lc2.id,
             rb.unidade,
             rb.rotulo,
             rb.tipo_despesa
      FROM public.lc131_despesas lc2
      JOIN public.bd_ref rb
        ON rb.codigo = lc2.codigo_ug::text
      WHERE (lc2.unidade IS NULL OR lc2.rotulo IS NULL OR lc2.tipo_despesa IS NULL)
        AND (rb.unidade IS NOT NULL OR rb.rotulo IS NOT NULL OR rb.tipo_despesa IS NOT NULL)
      LIMIT p_batch_size
    ) rb
    WHERE lc.id = rb.id;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
  END IF;

  RETURN json_build_object('updated', updated_count);
END;
$$;

SELECT 'Função enrich_bdref_batch criada com sucesso' AS status;
