-- ================================================================
-- DIAGNÓSTICO: Por que enrich não preencheu todos os 50 tipos?
-- ================================================================

-- 1. Quantidade de mapeamentos em tipo_despesa_ref
SELECT 
  COUNT(*) AS total_mapeamentos,
  COUNT(DISTINCT tipo_despesa) AS distinct_tipos
FROM tipo_despesa_ref;

-- 2. Quantos registros em lc131_despesas foram atualizados (têm tipo_despesa agora)
SELECT 
  COUNT(*) AS total_registros,
  SUM(CASE WHEN tipo_despesa IS NOT NULL AND tipo_despesa <> '' THEN 1 ELSE 0 END) AS com_tipo_despesa,
  SUM(CASE WHEN tipo_despesa IS NULL OR tipo_despesa = '' THEN 1 ELSE 0 END) AS sem_tipo_despesa
FROM lc131_despesas;

-- 3. Quantos registros têm descricao_processo que não têm match em tipo_despesa_ref
SELECT 
  COUNT(DISTINCT d.id) AS sem_match,
  COUNT(DISTINCT norm_tipo_desc(d.descricao_processo)) AS distinct_desc_norm
FROM lc131_despesas d
LEFT JOIN tipo_despesa_ref tdr
  ON norm_tipo_desc(d.descricao_processo) = tdr.descricao_processo_norm
WHERE tdr.id IS NULL;

-- 4. Exemplos de descricao_processo NÃO encontradas em tipo_despesa_ref
SELECT 
  COUNT(*) AS registros,
  norm_tipo_desc(d.descricao_processo) AS desc_normalizada,
  COUNT(DISTINCT d.descricao_processo) AS variacoes
FROM lc131_despesas d
LEFT JOIN tipo_despesa_ref tdr
  ON norm_tipo_desc(d.descricao_processo) = tdr.descricao_processo_norm
WHERE tdr.id IS NULL
GROUP BY norm_tipo_desc(d.descricao_processo)
ORDER BY registros DESC
LIMIT 30;

-- 5. Tipos_despesa na ref vs tipos atualizados
SELECT 'em tipo_despesa_ref' AS origem, COUNT(DISTINCT tipo_despesa) AS distintos
FROM tipo_despesa_ref
UNION ALL
SELECT 'em lc131_despesas', COUNT(DISTINCT tipo_despesa)
FROM lc131_despesas
WHERE tipo_despesa IS NOT NULL AND tipo_despesa <> '';
