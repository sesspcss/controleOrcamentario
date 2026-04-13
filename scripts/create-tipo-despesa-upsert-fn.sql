-- ================================================================
-- Cria função RPC para inserir dados em tipo_despesa_ref via RPC
-- (evita o bloqueio do proxy na rota /rest/v1/tipo_despesa_ref)
-- Executar no Supabase SQL Editor
-- ================================================================
SET statement_timeout = 0;

CREATE OR REPLACE FUNCTION public.upsert_tipo_despesa_ref(p_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer := 0;
BEGIN
  INSERT INTO public.tipo_despesa_ref (
    descricao_processo_norm,
    descricao_processo_exemplo,
    tipo_despesa,
    ocorrencias,
    atualizado_em
  )
  SELECT
    (el->>'descricao_processo_norm'),
    (el->>'descricao_processo_exemplo'),
    (el->>'tipo_despesa'),
    (el->>'ocorrencias')::integer,
    COALESCE((el->>'atualizado_em')::timestamptz, now())
  FROM jsonb_array_elements(p_rows) AS el
  WHERE (el->>'descricao_processo_norm') IS NOT NULL
  ON CONFLICT (descricao_processo_norm) DO UPDATE SET
    descricao_processo_exemplo = EXCLUDED.descricao_processo_exemplo,
    tipo_despesa               = EXCLUDED.tipo_despesa,
    ocorrencias                = EXCLUDED.ocorrencias,
    atualizado_em              = EXCLUDED.atualizado_em;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_tipo_despesa_ref(jsonb) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
