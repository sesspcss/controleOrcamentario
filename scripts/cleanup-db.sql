-- ================================================================
-- cleanup-db.sql — Limpeza de dados desnecessários para liberar espaço
-- Execute no Supabase SQL Editor (cada PARTE separadamente).
-- NÃO altera lógica, funções nem schema.
-- ================================================================
-- ORDEM OBRIGATÓRIA:
--   1. Deploy fix-tipo-by-year.sql (v9.2) no SQL Editor
--   2. SELECT public.refresh_bdref_lookup();   ← popula L4 com UG→tipo
--   3. node scripts/run-fix-tipo.mjs           ← classifica tudo
--   4. Executar bloco DO $$ de rótulo (final do fix-tipo-by-year.sql)
--   5. Execute PARTE 0 deste script            ← normaliza nomes DRS/RRAS
--   6. Execute PARTE A deste script            ← libera bd_ref_tipo
--   7. Execute PARTE B (VACUUMs) separadamente
-- ================================================================

-- ════════════════════════════════════════════
-- PARTE 0 — Normalizar nomes duplicados de DRS
-- O campo drs pode ter dois formatos para a mesma regional:
--   "01 GRANDE SÃO PAULO"  →  "DRS I - GRANDE SÃO PAULO"
-- Execute esta parte uma única vez.
-- ════════════════════════════════════════════

-- Diagnóstico: ver todos os valores distintos de DRS antes de normalizar
SELECT drs, count(*) AS qtd
FROM public.lc131_despesas
GROUP BY drs ORDER BY drs;

-- Normalização: mapeia prefixo numérico → formato canônico com algarismo romano
UPDATE public.lc131_despesas
SET drs = CASE drs
  WHEN '01 GRANDE SÃO PAULO'      THEN 'DRS I - GRANDE SÃO PAULO'
  WHEN '02 ARAÇATUBA'             THEN 'DRS II - ARAÇATUBA'
  WHEN '03 ARARAQUARA'            THEN 'DRS III - ARARAQUARA'
  WHEN '04 BAIXADA SANTISTA'      THEN 'DRS IV - BAIXADA SANTISTA'
  WHEN '05 BARRETOS'              THEN 'DRS V - BARRETOS'
  WHEN '06 BAURU'                 THEN 'DRS VI - BAURU'
  WHEN '07 CAMPINAS'              THEN 'DRS VII - CAMPINAS'
  WHEN '08 FRANCA'                THEN 'DRS VIII - FRANCA'
  WHEN '09 MARÍLIA'               THEN 'DRS IX - MARÍLIA'
  WHEN '10 PIRACICABA'            THEN 'DRS X - PIRACICABA'
  WHEN '11 PRESIDENTE PRUDENTE'   THEN 'DRS XI - PRESIDENTE PRUDENTE'
  WHEN '12 REGISTRO'              THEN 'DRS XII - REGISTRO'
  WHEN '13 RIBEIRÃO PRETO'        THEN 'DRS XIII - RIBEIRÃO PRETO'
  WHEN '14 SÃO JOÃO DA BOA VISTA' THEN 'DRS XIV - SÃO JOÃO DA BOA VISTA'
  WHEN '15 SÃO JOSÉ DO RIO PRETO' THEN 'DRS XV - SÃO JOSÉ DO RIO PRETO'
  WHEN '16 SOROCABA'              THEN 'DRS XVI - SOROCABA'
  WHEN '17 TAUBATÉ'               THEN 'DRS XVII - TAUBATÉ'
  ELSE drs
END
WHERE drs ~ E'^[0-9]{2} ';

-- Verificar resultado: deve haver somente um registro por DRS canonical
SELECT drs, count(*) AS qtd
FROM public.lc131_despesas
GROUP BY drs ORDER BY drs;

-- ════════════════════════════════════════════
-- PARTE A — Cole e execute no SQL Editor
-- ════════════════════════════════════════════

-- ─ 1. Diagnóstico: verificar quantas linhas ainda estão sem tipo ──
SELECT ano_referencia,
       count(*)                                          AS total,
       count(tipo_despesa)                               AS classificadas,
       count(*) - count(tipo_despesa)                   AS sem_tipo,
       round(count(tipo_despesa)::numeric/count(*)*100,1) AS pct_ok
FROM public.lc131_despesas
GROUP BY ano_referencia ORDER BY ano_referencia;

-- ─ 2. Diagnóstico: top UGs com linhas ainda sem tipo (após rodar fix) ─
-- Se o resultado for vazio, tudo está classificado. Se houver linhas,
-- adicione os padrões correspondentes ao fix-tipo-by-year.sql.
SELECT codigo_nome_ug,
       sum(COALESCE(empenhado,0)) AS empenhado_total,
       count(*)                   AS qtd
FROM public.lc131_despesas
WHERE tipo_despesa IS NULL
GROUP BY codigo_nome_ug
ORDER BY empenhado_total DESC
LIMIT 30;

-- ─ 3. Liberar bd_ref_tipo (maior tabela — 416k linhas, ~200MB) ────
-- Execute SOMENTE após rodar refresh_bdref_lookup() e run-fix-tipo.mjs.
-- Após este passo a tabela não é mais necessária.
TRUNCATE TABLE public.bd_ref_tipo;

-- ─ 4. Verificar tamanho após TRUNCATE (antes do VACUUM) ──────────
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size('public.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size('public.'||tablename))       AS table_size,
  pg_size_pretty(pg_indexes_size('public.'||tablename))        AS indexes_size
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('lc131_despesas','bd_ref_tipo','bd_ref_lookup_l1','bd_ref_lookup_l2','bd_ref_lookup_l3','bd_ref_lookup_l4','tab_municipios')
ORDER BY pg_total_relation_size('public.'||tablename) DESC;

SELECT pg_size_pretty(sum(pg_total_relation_size(schemaname||'.'||tablename))) AS total_db_size
FROM pg_tables WHERE schemaname = 'public';


-- ════════════════════════════════════════════════════════════════════
-- PARTE B — Execute cada VACUUM em aba separada (não pode estar em bloco)
-- ════════════════════════════════════════════════════════════════════

-- Aba 1 — O mais importante: libera bloat dos bulk UPDATEs de tipo_despesa
/*
VACUUM FULL ANALYZE public.lc131_despesas;
*/

-- Aba 2 — Libera espaço físico do bd_ref_tipo após TRUNCATE
/*
VACUUM FULL ANALYZE public.bd_ref_tipo;
*/

-- Aba 3 — Verificar tamanho final
/*
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size('public.'||tablename)) AS total_size
FROM pg_tables WHERE schemaname = 'public'
ORDER BY pg_total_relation_size('public.'||tablename) DESC;

SELECT pg_size_pretty(sum(pg_total_relation_size(schemaname||'.'||tablename))) AS total_db_size
FROM pg_tables WHERE schemaname = 'public';
*/
