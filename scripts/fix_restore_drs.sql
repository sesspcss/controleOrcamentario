-- ================================================================
-- PASSO 1: Execute TUDO de compact_functions_all.sql primeiro
-- (cria colunas + recria funções com COALESCE seguro)
-- ================================================================

-- ================================================================
-- PASSO 2: RESTAURAR DRS
-- O refresh_dashboard_batch agora usa COALESCE e nunca apaga valores.
-- Execute este bloco repetidamente até retornar 0:
-- ================================================================
SELECT refresh_dashboard_batch(5000);

-- ================================================================
-- PASSO 3: VERIFICAR
-- ================================================================
-- SELECT COUNT(*) AS total, COUNT(drs) AS com_drs, COUNT(unidade) AS com_unidade FROM lc131_despesas;
