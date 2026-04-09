-- ================================================================
-- COMPACTAR 1/5 — Criar tabela nova SÓ com colunas usadas (zero bloat)
-- ================================================================
SET statement_timeout = 0;

CREATE TABLE IF NOT EXISTS public.lc131_compact (
  id                              bigint PRIMARY KEY,
  ano_referencia                  integer,
  nome_municipio                  text,
  codigo_nome_uo                  text,
  codigo_ug                       bigint,
  codigo_nome_ug                  text,
  codigo_projeto_atividade        bigint,
  codigo_nome_projeto_atividade   text,
  codigo_nome_fonte_recurso       text,
  codigo_nome_grupo               text,
  codigo_nome_elemento            text,
  codigo_elemento                 bigint,
  codigo_nome_favorecido          text,
  codigo_favorecido               text,
  empenhado                       numeric,
  liquidado                       numeric,
  pago                            numeric,
  pago_anos_anteriores            numeric,
  drs                             text,
  rras                            text,
  regiao_ad                       text,
  regiao_sa                       text,
  cod_ibge                        text,
  municipio                       text,
  fonte_recurso                   text,
  grupo_despesa                   text,
  tipo_despesa                    text,
  rotulo                          text,
  pago_total                      numeric
);

SELECT 'Tabela lc131_compact criada' AS status;
