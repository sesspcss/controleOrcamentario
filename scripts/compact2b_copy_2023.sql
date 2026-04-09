-- ================================================================
-- COMPACTAR 2b — Copiar 2023 (~115k rows)
-- ================================================================
SET statement_timeout = 0;

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
FROM public.lc131_despesas
WHERE ano_referencia = 2023;

SELECT COUNT(*) AS copiado_2023 FROM public.lc131_compact WHERE ano_referencia = 2023;
