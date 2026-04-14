-- ================================================================
-- Enriquece rotulo, unidade e tipo_despesa em lc131_despesas a partir de bd_ref.
-- Estratégia: uma chamada por código de bd_ref → usa índice idx_lc131_cod_projeto
-- Execute no Supabase SQL Editor, depois rode: node scripts/run-enrich-bdref.mjs
-- ================================================================

-- Função 1: retorna todos os codigos de bd_ref que têm dados úteis
CREATE OR REPLACE FUNCTION public.list_bdref_codigos()
RETURNS json
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_agg(codigo ORDER BY codigo)
  FROM public.bd_ref
  WHERE unidade IS NOT NULL OR rotulo IS NOT NULL OR tipo_despesa IS NOT NULL;
$$;

-- Função 2: atualiza lc131_despesas para um código específico
-- Usa o índice idx_lc131_cod_projeto (rápido, < 1s por código)
CREATE OR REPLACE FUNCTION public.enrich_bdref_by_code(p_codigo text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref_unidade      text;
  ref_rotulo       text;
  ref_tipo_despesa text;
  updated_count    integer;
BEGIN
  SELECT unidade, rotulo, tipo_despesa
  INTO ref_unidade, ref_rotulo, ref_tipo_despesa
  FROM public.bd_ref
  WHERE codigo = p_codigo
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('updated', 0);
  END IF;

  -- Atualiza apenas linhas que ainda têm NULL (preserva valores já preenchidos)
  -- Usa índice no codigo_projeto_atividade → muito rápido
  UPDATE public.lc131_despesas
  SET
    unidade      = COALESCE(unidade,      ref_unidade),
    rotulo       = COALESCE(rotulo,       ref_rotulo),
    tipo_despesa = COALESCE(tipo_despesa, ref_tipo_despesa)
  WHERE codigo_projeto_atividade::text = p_codigo
    AND (
      (unidade      IS NULL AND ref_unidade      IS NOT NULL) OR
      (rotulo       IS NULL AND ref_rotulo        IS NOT NULL) OR
      (tipo_despesa IS NULL AND ref_tipo_despesa  IS NOT NULL)
    );

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  -- Fallback: tenta também via codigo_ug (para linhas sem codigo_projeto_atividade)
  UPDATE public.lc131_despesas
  SET
    unidade      = COALESCE(unidade,      ref_unidade),
    rotulo       = COALESCE(rotulo,       ref_rotulo),
    tipo_despesa = COALESCE(tipo_despesa, ref_tipo_despesa)
  WHERE codigo_ug::text = p_codigo
    AND (codigo_projeto_atividade IS NULL OR codigo_projeto_atividade::text <> p_codigo)
    AND (
      (unidade      IS NULL AND ref_unidade      IS NOT NULL) OR
      (rotulo       IS NULL AND ref_rotulo        IS NOT NULL) OR
      (tipo_despesa IS NULL AND ref_tipo_despesa  IS NOT NULL)
    );

  updated_count := updated_count + ROW_COUNT;

  RETURN json_build_object('updated', updated_count);
END;
$$;

SELECT 'Funções list_bdref_codigos e enrich_bdref_by_code criadas' AS status;
