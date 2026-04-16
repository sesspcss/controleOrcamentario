-- ================================================================
-- Cria tabela bd_ref_tipo — referência oficial bd_ref.xlsx
-- Mapeia combinações de colunas → tipo_despesa
--
-- Execute no Supabase SQL Editor ANTES de rodar import-bdref-tipo.mjs
-- ================================================================

-- Drop se existir para recriação limpa
DROP TABLE IF EXISTS public.bd_ref_tipo CASCADE;

CREATE TABLE public.bd_ref_tipo (
  id                            BIGSERIAL PRIMARY KEY,
  codigo_nome_uo                TEXT,
  codigo_nome_ug                TEXT,
  codigo_nome_projeto_atividade TEXT,
  codigo_nome_fonte_recurso     TEXT,
  fonte_recurso                 TEXT,
  codigo_nome_grupo             TEXT,
  grupo_despesa                 TEXT,
  codigo_nome_elemento          TEXT,
  tipo_despesa                  TEXT NOT NULL,
  unidade                       TEXT,
  codigo_nome_favorecido        TEXT,
  descricao_processo            TEXT
);

-- Índices para lookup eficiente
CREATE INDEX idx_bdref_tipo_ug       ON public.bd_ref_tipo (codigo_nome_ug);
CREATE INDEX idx_bdref_tipo_projeto  ON public.bd_ref_tipo (codigo_nome_projeto_atividade);
CREATE INDEX idx_bdref_tipo_desc     ON public.bd_ref_tipo (descricao_processo);
CREATE INDEX idx_bdref_tipo_elemento ON public.bd_ref_tipo (codigo_nome_elemento);
CREATE INDEX idx_bdref_tipo_despesa  ON public.bd_ref_tipo (tipo_despesa);

-- RLS: acesso público leitura
ALTER TABLE public.bd_ref_tipo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all_bdref_tipo" ON public.bd_ref_tipo FOR SELECT USING (true);
GRANT SELECT ON public.bd_ref_tipo TO anon, authenticated;

SELECT 'Tabela bd_ref_tipo criada com sucesso' AS status;
