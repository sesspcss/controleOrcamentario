-- ================================================================
-- fix-rras-numbers.sql — Normaliza RRAS com números soltos (sem prefixo)
-- Execute UMA VEZ no Supabase SQL Editor para corrigir registros existentes.
--
-- Converte: '6' → 'RRAS 06', '12' → 'RRAS 12', '9' → 'RRAS 09', etc.
-- ================================================================

UPDATE public.lc131_despesas
SET rras = CASE
  WHEN rras = '1'  OR rras = '01'  THEN 'RRAS 01'
  WHEN rras = '2'  OR rras = '02'  THEN 'RRAS 02'
  WHEN rras = '3'  OR rras = '03'  THEN 'RRAS 03'
  WHEN rras = '4'  OR rras = '04'  THEN 'RRAS 04'
  WHEN rras = '5'  OR rras = '05'  THEN 'RRAS 05'
  WHEN rras = '6'  OR rras = '06'  THEN 'RRAS 06'
  WHEN rras = '7'  OR rras = '07'  THEN 'RRAS 07'
  WHEN rras = '8'  OR rras = '08'  THEN 'RRAS 08'
  WHEN rras = '9'  OR rras = '09'  THEN 'RRAS 09'
  WHEN rras = '10'                  THEN 'RRAS 10'
  WHEN rras = '11'                  THEN 'RRAS 11'
  WHEN rras = '12'                  THEN 'RRAS 12'
  WHEN rras = '13'                  THEN 'RRAS 13'
  WHEN rras = '14'                  THEN 'RRAS 14'
  WHEN rras = '15'                  THEN 'RRAS 15'
  WHEN rras = '16'                  THEN 'RRAS 16'
  WHEN rras = '17'                  THEN 'RRAS 17'
  ELSE rras
END
WHERE rras ~ '^[0-9]{1,2}$';

-- Resultado esperado: todas as linhas com RRAS numérico convertidas
SELECT
  rras,
  COUNT(*) AS total
FROM public.lc131_despesas
WHERE rras IS NOT NULL AND rras <> ''
GROUP BY rras
ORDER BY rras;
