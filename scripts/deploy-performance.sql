-- ═══════════════════════════════════════════════════════════════
-- deploy-performance.sql
-- Execute no Supabase SQL Editor para otimizar performance
-- IMPORTANTE: Execute CADA BLOCO separadamente (selecione e Run)
-- ═══════════════════════════════════════════════════════════════

-- ▶ BLOCO 1: Atualizar estatísticas (rodar PRIMEIRO e SOZINHO)
-- (VACUUM não roda no SQL Editor - o autovacuum já cuida disso)
ANALYZE lc131_despesas;


-- ▶ BLOCO 2: Verificação URGENTE - descricao_processo foi importado?
-- (Rodar SOZINHO após BLOCO 1)
SELECT ano_referencia,
       COUNT(*) AS total,
       COUNT(descricao_processo) AS com_desc_processo,
       COUNT(numero_processo) AS com_num_processo
FROM lc131_despesas
GROUP BY ano_referencia
ORDER BY ano_referencia;


-- ▶ BLOCO 3: Índices de performance (rodar SOZINHO)
-- Se timeout, rode cada CREATE INDEX individualmente
CREATE INDEX IF NOT EXISTS idx_lc131_ano_empenhado
  ON public.lc131_despesas (ano_referencia, empenhado DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_lc131_regiao_ad
  ON public.lc131_despesas (regiao_ad);

CREATE INDEX IF NOT EXISTS idx_lc131_rras
  ON public.lc131_despesas (rras);

CREATE INDEX IF NOT EXISTS idx_lc131_regiao_sa
  ON public.lc131_despesas (regiao_sa);

CREATE INDEX IF NOT EXISTS idx_lc131_tipo_despesa
  ON public.lc131_despesas (tipo_despesa);

CREATE INDEX IF NOT EXISTS idx_lc131_rotulo
  ON public.lc131_despesas (rotulo);

CREATE INDEX IF NOT EXISTS idx_lc131_codigo_nome_uo
  ON public.lc131_despesas (codigo_nome_uo);

CREATE INDEX IF NOT EXISTS idx_lc131_codigo_nome_elemento
  ON public.lc131_despesas (codigo_nome_elemento);

CREATE INDEX IF NOT EXISTS idx_lc131_codigo_nome_favorecido
  ON public.lc131_despesas (codigo_nome_favorecido);

CREATE INDEX IF NOT EXISTS idx_lc131_codigo_nome_fonte_recurso
  ON public.lc131_despesas (codigo_nome_fonte_recurso);

CREATE INDEX IF NOT EXISTS idx_lc131_descricao_processo
  ON public.lc131_despesas (descricao_processo)
  WHERE descricao_processo IS NOT NULL;


-- ▶ BLOCO 4: Reload do schema cache do PostgREST
-- (necessário para o REST API reconhecer colunas novas)
NOTIFY pgrst, 'reload schema';


-- ▶ BLOCO 5: ANALYZE final após criação dos índices
ANALYZE lc131_despesas;
