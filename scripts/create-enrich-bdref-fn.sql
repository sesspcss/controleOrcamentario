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
  p_batch_size integer DEFAULT 5000
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  WITH candidates AS (
    SELECT
      lc.id,
      COALESCE(rb1.unidade,      rb2.unidade,      rb3.unidade)      AS new_unidade,
      COALESCE(rb1.rotulo,       rb2.rotulo,        rb3.rotulo)       AS new_rotulo,
      -- tipo_despesa: prefere valor já enriquecido pelo XLSX; bd_ref apenas como fallback
      COALESCE(lc.tipo_despesa,  rb1.tipo_despesa,  rb2.tipo_despesa,  rb3.tipo_despesa) AS new_tipo_despesa
    FROM public.lc131_despesas lc

    -- JOIN 1: codigo_projeto_atividade → bd_ref.codigo (match exato)
    LEFT JOIN public.bd_ref rb1
      ON rb1.codigo = lc.codigo_projeto_atividade::text

    -- JOIN 2: codigo_ug → bd_ref.codigo (fallback)
    LEFT JOIN public.bd_ref rb2
      ON rb2.codigo = lc.codigo_ug::text

    -- JOIN 3: prefixo numérico de codigo_nome_ug → bd_ref.codigo
    LEFT JOIN public.bd_ref rb3
      ON rb3.codigo = NULLIF(
           regexp_replace(
             split_part(lc.codigo_nome_ug::text, ' ', 1),
             '[^0-9]', '', 'g'
           ), '')

    WHERE
      -- Só processa linhas onde pelo menos um dos campos está nulo
      (lc.unidade IS NULL OR lc.rotulo IS NULL OR lc.tipo_despesa IS NULL)
      -- E pelo menos um JOIN resultou em dados úteis
      AND (
        rb1.codigo IS NOT NULL OR
        rb2.codigo IS NOT NULL OR
        rb3.codigo IS NOT NULL
      )
    LIMIT p_batch_size
  )
  UPDATE public.lc131_despesas lc
  SET
    unidade      = CASE WHEN lc.unidade      IS NULL THEN c.new_unidade      ELSE lc.unidade      END,
    rotulo       = CASE WHEN lc.rotulo       IS NULL THEN c.new_rotulo       ELSE lc.rotulo       END,
    tipo_despesa = CASE WHEN lc.tipo_despesa IS NULL THEN c.new_tipo_despesa ELSE lc.tipo_despesa END
  FROM candidates c
  WHERE lc.id = c.id
    AND (
      (lc.unidade      IS NULL AND c.new_unidade      IS NOT NULL) OR
      (lc.rotulo       IS NULL AND c.new_rotulo       IS NOT NULL) OR
      (lc.tipo_despesa IS NULL AND c.new_tipo_despesa IS NOT NULL)
    );

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN json_build_object('updated', updated_count);
END;
$$;

SELECT 'Função enrich_bdref_batch criada com sucesso' AS status;
