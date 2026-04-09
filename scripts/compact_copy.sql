-- ================================================================
-- COMPACTAR — Copiar TODOS os dados de uma vez (~464k rows)
-- Substitui os scripts compact2a-2e
-- ================================================================
SET statement_timeout = 0;

-- Limpar caso tenha cópia parcial anterior
TRUNCATE public.lc131_compact;

-- Corrigir tipo da coluna (compact1 criou como bigint, mas é text)
ALTER TABLE public.lc131_compact ALTER COLUMN codigo_favorecido TYPE text;

-- Copiar tudo de uma vez (INSERT SELECT é rápido, sem dead tuples)
INSERT INTO public.lc131_compact
SELECT
  id, ano_referencia, nome_municipio,
  codigo_nome_uo, codigo_ug, codigo_nome_ug,
  codigo_projeto_atividade, codigo_nome_projeto_atividade,
  codigo_nome_fonte_recurso, codigo_nome_grupo,
  codigo_nome_elemento, codigo_elemento,
  codigo_nome_favorecido, codigo_favorecido,
  empenhado, liquidado, pago, pago_anos_anteriores,
  drs, rras, regiao_ad, regiao_sa, cod_ibge, municipio,
  fonte_recurso, grupo_despesa, tipo_despesa, rotulo, pago_total
FROM public.lc131_despesas;

-- Verificar contagem por ano
SELECT ano_referencia, COUNT(*) AS registros
FROM public.lc131_compact
GROUP BY ano_referencia
ORDER BY ano_referencia;
