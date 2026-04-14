-- ================================================================
-- PARTE 2: VACUUM FULL + INDEXES
-- Execute como statements SEPARADOS no SQL Editor (um de cada vez)
-- ================================================================

-- ========== STATEMENT A: RECONSTRUÇÃO DA TABELA ==========
-- VACUUM FULL e dblink estão bloqueados no Supabase SQL Editor.
-- Use o script Node.js abaixo em vez disso:
--
--   1. Execute create-rebuild-fns.sql aqui no SQL Editor (uma vez)
--   2. No terminal:
--        $env:NODE_TLS_REJECT_UNAUTHORIZED="0"
--        node scripts/run-rebuild.mjs
--
-- O script copia as linhas vivas para staging, faz TRUNCATE da tabela
-- original (libera espaço imediatamente) e re-insere os dados.
-- Resultado equivalente ao VACUUM FULL: ~150-250 MB recuperados.


-- ================================================================
-- ========== STATEMENT B: INDEXES (execute após o VACUUM) ==========
-- Execute estes após o VACUUM completar
-- ================================================================

-- Índice composto para filtros simultâneos (ano + tipo_despesa)
-- Cobre 80% dos casos de uso do dashboard
CREATE INDEX IF NOT EXISTS idx_lc131_ano_tipo
  ON public.lc131_despesas (ano_referencia, tipo_despesa)
  WHERE tipo_despesa IS NOT NULL AND tipo_despesa <> '';

-- Índice para tipo_despesa (filtro mais novo, pode estar ausente)
CREATE INDEX IF NOT EXISTS idx_lc131_tipo_despesa
  ON public.lc131_despesas (tipo_despesa)
  WHERE tipo_despesa IS NOT NULL AND tipo_despesa <> '';

-- Índice composto para filtros regionais (os mais usados em conjunto)
CREATE INDEX IF NOT EXISTS idx_lc131_drs_ano
  ON public.lc131_despesas (drs, ano_referencia);

CREATE INDEX IF NOT EXISTS idx_lc131_municipio_ano
  ON public.lc131_despesas (municipio, ano_referencia);

-- Garante que os índices básicos existam
CREATE INDEX IF NOT EXISTS idx_lc131_ano       ON public.lc131_despesas (ano_referencia);
CREATE INDEX IF NOT EXISTS idx_lc131_drs       ON public.lc131_despesas (drs);
CREATE INDEX IF NOT EXISTS idx_lc131_municipio ON public.lc131_despesas (municipio);
CREATE INDEX IF NOT EXISTS idx_lc131_rras      ON public.lc131_despesas (rras);
CREATE INDEX IF NOT EXISTS idx_lc131_rotulo    ON public.lc131_despesas (rotulo);
CREATE INDEX IF NOT EXISTS idx_lc131_empenhado ON public.lc131_despesas (empenhado DESC NULLS LAST);

-- Atualiza estatísticas do otimizador
ANALYZE public.lc131_despesas;

NOTIFY pgrst, 'reload schema';

SELECT 'Indexes e ANALYZE concluídos' AS status;
