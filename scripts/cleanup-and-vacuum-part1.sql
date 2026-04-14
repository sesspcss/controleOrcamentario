-- ================================================================
-- LIMPEZA + PERFORMANCE — Reduz tamanho e melhora velocidade
-- Execute no Supabase SQL Editor em DUAS partes separadas
-- ================================================================

-- ========== PARTE 1: LIMPEZA (execute primeiro) ==========

-- 1. Remover tabela lookup (não é mais necessária após enriquecimento)
DROP TABLE IF EXISTS public.tipo_despesa_ref CASCADE;

-- 2. Remover funções auxiliares de enriquecimento (não são mais necessárias)
DROP FUNCTION IF EXISTS public.norm_tipo_desc(text) CASCADE;
DROP FUNCTION IF EXISTS public.enrich_tipo_despesa_batch(integer);

-- 3. Remover funções de diagnóstico temporárias (se existirem)
DROP FUNCTION IF EXISTS public.enrich_tipo_despesa_loop(integer);

-- Confirma o que foi removido
SELECT 'Limpeza concluída' AS status;
