-- ================================================================
-- FIX DEFINITIVO: Corrigir TODOS os nomes de colunas em TODAS tabelas
-- O Supabase Table Editor mostra COMMENTS como labels.
-- Este SQL limpa todos os comments errados e define os corretos.
--
-- Execute TUDO de uma vez no SQL Editor do Supabase
-- ================================================================


-- ================================================================
-- TABELA: bd_ref — 13 colunas
-- ================================================================
COMMENT ON COLUMN public.bd_ref.id            IS 'id';
COMMENT ON COLUMN public.bd_ref.codigo        IS 'codigo';
COMMENT ON COLUMN public.bd_ref.unidade       IS 'unidade';
COMMENT ON COLUMN public.bd_ref.drs           IS 'drs';
COMMENT ON COLUMN public.bd_ref.regiao_ad     IS 'regiao_ad';
COMMENT ON COLUMN public.bd_ref.rras          IS 'rras';
COMMENT ON COLUMN public.bd_ref.regiao_sa     IS 'regiao_sa';
COMMENT ON COLUMN public.bd_ref.cod_ibge      IS 'cod_ibge';
COMMENT ON COLUMN public.bd_ref.municipio     IS 'municipio';
COMMENT ON COLUMN public.bd_ref.fonte_recurso IS 'fonte_recurso';
COMMENT ON COLUMN public.bd_ref.grupo_despesa IS 'grupo_despesa';
COMMENT ON COLUMN public.bd_ref.tipo_despesa  IS 'tipo_despesa';
COMMENT ON COLUMN public.bd_ref.rotulo        IS 'rotulo';


-- ================================================================
-- TABELA: lc131_despesas — 33 colunas
-- ================================================================
COMMENT ON COLUMN public.lc131_despesas.id                              IS 'id';
COMMENT ON COLUMN public.lc131_despesas.ano_referencia                  IS 'ano_referencia';
COMMENT ON COLUMN public.lc131_despesas.nome_municipio                  IS 'nome_municipio';
COMMENT ON COLUMN public.lc131_despesas.municipio                       IS 'municipio';
COMMENT ON COLUMN public.lc131_despesas.codigo_nome_uo                  IS 'codigo_nome_uo';
COMMENT ON COLUMN public.lc131_despesas.codigo_ug                       IS 'codigo_ug';
COMMENT ON COLUMN public.lc131_despesas.codigo_nome_ug                  IS 'codigo_nome_ug';
COMMENT ON COLUMN public.lc131_despesas.codigo_projeto_atividade        IS 'codigo_projeto_atividade';
COMMENT ON COLUMN public.lc131_despesas.codigo_nome_projeto_atividade   IS 'codigo_nome_projeto_atividade';
COMMENT ON COLUMN public.lc131_despesas.codigo_nome_fonte_recurso       IS 'codigo_nome_fonte_recurso';
COMMENT ON COLUMN public.lc131_despesas.codigo_fonte_recursos           IS 'codigo_fonte_recursos';
COMMENT ON COLUMN public.lc131_despesas.fonte_recurso                   IS 'fonte_recurso';
COMMENT ON COLUMN public.lc131_despesas.codigo_nome_grupo               IS 'codigo_nome_grupo';
COMMENT ON COLUMN public.lc131_despesas.grupo_despesa                   IS 'grupo_despesa';
COMMENT ON COLUMN public.lc131_despesas.codigo_nome_elemento            IS 'codigo_nome_elemento';
COMMENT ON COLUMN public.lc131_despesas.codigo_elemento                 IS 'codigo_elemento';
COMMENT ON COLUMN public.lc131_despesas.codigo_nome_favorecido          IS 'codigo_nome_favorecido';
COMMENT ON COLUMN public.lc131_despesas.codigo_favorecido               IS 'codigo_favorecido';
COMMENT ON COLUMN public.lc131_despesas.descricao_processo              IS 'descricao_processo';
COMMENT ON COLUMN public.lc131_despesas.numero_processo                 IS 'numero_processo';
COMMENT ON COLUMN public.lc131_despesas.empenhado                       IS 'empenhado';
COMMENT ON COLUMN public.lc131_despesas.liquidado                       IS 'liquidado';
COMMENT ON COLUMN public.lc131_despesas.pago                            IS 'pago';
COMMENT ON COLUMN public.lc131_despesas.pago_anos_anteriores            IS 'pago_anos_anteriores';
COMMENT ON COLUMN public.lc131_despesas.pago_total                      IS 'pago_total';
COMMENT ON COLUMN public.lc131_despesas.drs                             IS 'drs';
COMMENT ON COLUMN public.lc131_despesas.regiao_ad                       IS 'regiao_ad';
COMMENT ON COLUMN public.lc131_despesas.rras                            IS 'rras';
COMMENT ON COLUMN public.lc131_despesas.regiao_sa                       IS 'regiao_sa';
COMMENT ON COLUMN public.lc131_despesas.cod_ibge                        IS 'cod_ibge';
COMMENT ON COLUMN public.lc131_despesas.unidade                         IS 'unidade';
COMMENT ON COLUMN public.lc131_despesas.rotulo                          IS 'rotulo';
COMMENT ON COLUMN public.lc131_despesas.tipo_despesa                    IS 'tipo_despesa';


-- ================================================================
-- TABELA: tab_drs — 2 colunas
-- ================================================================
COMMENT ON COLUMN public.tab_drs.municipio IS 'municipio';
COMMENT ON COLUMN public.tab_drs.drs       IS 'drs';


-- ================================================================
-- TABELA: tab_rras — 2 colunas
-- ================================================================
COMMENT ON COLUMN public.tab_rras.municipio IS 'municipio';
COMMENT ON COLUMN public.tab_rras.rras      IS 'rras';


-- ================================================================
-- Reload PostgREST schema cache
-- ================================================================
NOTIFY pgrst, 'reload schema';
