-- ================================================================
-- PASSO 2: Enriquecer lc131_despesas.tipo_despesa a partir de
--          tipo_despesa_ref (lookup por descricao_processo)
--
-- Executar DEPOIS de rodar:
--   1. recreate-tipo-despesa-ref.sql   (recriar tabela)
--   2. import-tipo-despesa.ts           (importar TIPO_DESPESA.xlsx)
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

-- Quantos registros serão atualizados (preview)
SELECT
  COUNT(*) AS total_rows,
  SUM(CASE WHEN tdr.tipo_despesa IS NOT NULL THEN 1 ELSE 0 END) AS will_update
FROM lc131_despesas d
LEFT JOIN tipo_despesa_ref tdr
  ON norm_tipo_desc(d.descricao_processo) = tdr.descricao_processo_norm;

-- UPDATE: preenche tipo_despesa usando o mapeamento da planilha
UPDATE lc131_despesas d
SET tipo_despesa = tdr.tipo_despesa
FROM tipo_despesa_ref tdr
WHERE norm_tipo_desc(d.descricao_processo) = tdr.descricao_processo_norm
  AND tdr.tipo_despesa IS NOT NULL
  AND tdr.tipo_despesa <> '';

-- Verificação do resultado
SELECT
  tipo_despesa,
  COUNT(*) AS registros
FROM lc131_despesas
WHERE tipo_despesa IS NOT NULL AND tipo_despesa <> ''
GROUP BY tipo_despesa
ORDER BY registros DESC
LIMIT 50;
