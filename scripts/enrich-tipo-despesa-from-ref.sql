-- ================================================================
-- PASSO 3: Enriquecer lc131_despesas.tipo_despesa em lotes
--          a partir de tipo_despesa_ref (lookup por descricao_processo)
--
-- PRÉ-REQUISITO:
--   1. recreate-tipo-despesa-ref.sql (recriar tabela)
--   2. create-tipo-despesa-upsert-fn.sql (recriar função RPC upsert)
--   3. import-tipo-despesa-rpc.mjs (importar TIPO_DESPESA.xlsx via RPC)
--   4. apply-descricao-tipo.sql (atualizar funções SQL)
--
-- ENTÃO execute este script
-- ================================================================
SET statement_timeout = 0;

-- Função auxiliar: normaliza texto para lookup
CREATE OR REPLACE FUNCTION public.norm_tipo_desc(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT upper(trim(regexp_replace(
    translate(p,
      'áàãâäéèêëíìîïóòõôöúùûüçÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ',
      'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'),
    '\s+', ' ', 'g')))
$$;

-- Preview: quantos registros serão atualizados
SELECT
  COUNT(*) AS total_lc131,
  COUNT(DISTINCT norm_tipo_desc(d.descricao_processo)) AS distinct_descricao_norm,
  (SELECT COUNT(*) FROM tipo_despesa_ref) AS tipo_despesa_ref_count,
  SUM(CASE WHEN tdr.tipo_despesa IS NOT NULL THEN 1 ELSE 0 END) AS will_update
FROM lc131_despesas d
LEFT JOIN tipo_despesa_ref tdr
  ON norm_tipo_desc(d.descricao_processo) = tdr.descricao_processo_norm;

-- UPDATE em lotes para evitar timeout
DO $$
DECLARE
  batch_size INTEGER := 5000;
  updated_count INTEGER := 0;
  total_updated INTEGER := 0;
  iteration INTEGER := 0;
BEGIN
  LOOP
    iteration := iteration + 1;
    
    -- Atualizar um lote: join simples, sem subconsultas aninhadas
    WITH to_update AS (
      SELECT d.id, tdr.tipo_despesa
      FROM lc131_despesas d
      INNER JOIN tipo_despesa_ref tdr 
        ON norm_tipo_desc(d.descricao_processo) = tdr.descricao_processo_norm
      WHERE (d.tipo_despesa IS NULL OR d.tipo_despesa = '' OR d.tipo_despesa IS DISTINCT FROM tdr.tipo_despesa)
        AND tdr.tipo_despesa IS NOT NULL
        AND tdr.tipo_despesa <> ''
      LIMIT batch_size
    )
    UPDATE lc131_despesas d
    SET tipo_despesa = to_update.tipo_despesa
    FROM to_update
    WHERE d.id = to_update.id;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    total_updated := total_updated + updated_count;
    
    RAISE NOTICE 'Batch % completed: +% (total: %)', iteration, updated_count, total_updated;
    
    EXIT WHEN updated_count < batch_size;  -- Se menos registros que batch_size, terminou
  END LOOP;
  
  RAISE NOTICE '✅ Enriquecimento concluído! Total atualizado: %', total_updated;
END $$;

-- Resultado final: distribuição dos tipos
SELECT
  tipo_despesa,
  COUNT(*) AS registros
FROM lc131_despesas
WHERE tipo_despesa IS NOT NULL AND tipo_despesa <> ''
GROUP BY tipo_despesa
ORDER BY registros DESC
LIMIT 60;
