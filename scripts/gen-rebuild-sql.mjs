// Generate SQL to rebuild bd_ref + re-enrich all data
// The SQL output should be run in Supabase SQL Editor
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

// ─── Read DESPESAS master file ───
const filePath = 'C:/Users/afpereira/Downloads/DESPESAS - 2022 - 2023 - 2024 - 2025   2026 - 31-03-26.xlsx';
const wb = XLSX.readFile(filePath);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
const hdr = rows[0];

const iDRS    = hdr.indexOf('DRS');
const iRA     = hdr.indexOf('REGIÃO ADMINISTRATIVA');
const iRRAS   = hdr.indexOf('RRAS');
const iRS     = hdr.indexOf('Região de Saúde');
const iIBGE   = hdr.indexOf('Cód IBGE');
const iMun    = hdr.indexOf('MUNICÍPIO');
const iUG     = hdr.findIndex(c => String(c).includes('Código Nome UG'));
const iFonte  = hdr.indexOf('FONTE DE RECURSOS');
const iGrupo  = hdr.indexOf('GRUPO DE DESPESA');
const iTipo   = hdr.indexOf('TIPO DE DESPESA');
const iRotulo = hdr.indexOf('RÓTULO');

// Extract unique UGs
const masterUGs = {};
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r || r.every(v => v === '' || v == null)) continue;
  const ugFull = String(r[iUG] || '').trim();
  const codMatch = ugFull.match(/^(\d{6})/);
  if (!codMatch) continue;
  const cod = codMatch[1];
  if (masterUGs[cod]) continue;

  const g = idx => String(r[idx] || '').trim() || null;
  masterUGs[cod] = {
    codigo:        cod,
    unidade:       ugFull.replace(/^\d+\s*-\s*/, '').trim(),
    drs:           g(iDRS),
    regiao_ad:     g(iRA),
    rras:          String(r[iRRAS] || '').trim() || null,
    regiao_sa:     g(iRS),
    cod_ibge:      String(r[iIBGE] || '').trim() || null,
    municipio:     g(iMun),
    fonte_recurso: g(iFonte),
    grupo_despesa: g(iGrupo),
    tipo_despesa:  g(iTipo),
    rotulo:        g(iRotulo),
  };
}

const entries = Object.values(masterUGs).sort((a, b) => a.codigo.localeCompare(b.codigo));
console.log(`Extracted ${entries.length} unique UGs from master file`);

// ─── Generate SQL ───
const Q = s => (s && String(s).trim()) ? "'" + String(s).replace(/'/g, "''") + "'" : 'NULL';

let sql = `-- =======================================================================
-- REBUILD BD_REF + RE-ENRICH ALL DATA
-- Generated from DESPESAS master file (${entries.length} unique UGs)
-- Execute in Supabase SQL Editor
-- =======================================================================

-- 1. Truncate bd_ref and re-insert with complete data
TRUNCATE TABLE public.bd_ref RESTART IDENTITY;

INSERT INTO public.bd_ref
  (codigo, unidade, drs, regiao_ad, rras, regiao_sa, cod_ibge, municipio, fonte_recurso, grupo_despesa, tipo_despesa, rotulo)
VALUES
`;

const valLines = entries.map(e =>
  `  (${Q(e.codigo)}, ${Q(e.unidade)}, ${Q(e.drs)}, ${Q(e.regiao_ad)}, ${Q(e.rras)}, ${Q(e.regiao_sa)}, ${Q(e.cod_ibge)}, ${Q(e.municipio)}, ${Q(e.fonte_recurso)}, ${Q(e.grupo_despesa)}, ${Q(e.tipo_despesa)}, ${Q(e.rotulo)})`
);
sql += valLines.join(',\n') + ';\n\n';

sql += `-- Verify
SELECT COUNT(*) AS bd_ref_count FROM public.bd_ref;

-- 2. Clear all enriched columns so they get re-populated
UPDATE public.lc131_despesas SET
  drs           = NULL,
  rras          = NULL,
  regiao_ad     = NULL,
  regiao_sa     = NULL,
  cod_ibge      = NULL,
  municipio     = NULL,
  unidade       = NULL,
  fonte_recurso = NULL,
  grupo_despesa = NULL,
  tipo_despesa  = NULL,
  rotulo        = NULL;

-- 3. Recreate enrichment function with improved fallbacks
CREATE OR REPLACE FUNCTION public.refresh_dashboard_batch(p_batch_size integer DEFAULT 5000)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET statement_timeout = 600000
AS $$
DECLARE rows_affected bigint;
BEGIN
  WITH candidates AS (
    SELECT id FROM lc131_despesas
    WHERE COALESCE(TRIM(drs),'') = ''
       OR COALESCE(TRIM(rotulo),'') = ''
       OR COALESCE(TRIM(tipo_despesa),'') = ''
       OR COALESCE(TRIM(unidade),'') = ''
       OR COALESCE(TRIM(regiao_ad),'') = ''
    LIMIT p_batch_size
  ),
  enriched AS (
    SELECT
      lc.id,
      -- DRS: tab_drs first (by nome_municipio or municipio), then bd_ref
      NULLIF(TRIM(COALESCE(td.drs, td2.drs, rb1.drs, rb2.drs, rb3.drs)), '')  AS e_drs,
      -- RRAS: tab_rras first, then bd_ref
      NULLIF(TRIM(COALESCE(tr.rras, tr2.rras, rb1.rras, rb2.rras, rb3.rras)), '') AS e_rras,
      -- Região Administrativa: bd_ref
      COALESCE(rb1.regiao_ad, rb2.regiao_ad, rb3.regiao_ad)     AS e_regiao_ad,
      -- Região de Saúde: bd_ref
      COALESCE(rb1.regiao_sa, rb2.regiao_sa, rb3.regiao_sa)     AS e_regiao_sa,
      -- Cód IBGE: bd_ref
      COALESCE(rb1.cod_ibge, rb2.cod_ibge, rb3.cod_ibge)        AS e_cod_ibge,
      -- Município: use nome_municipio from LC131, then bd_ref
      COALESCE(NULLIF(TRIM(lc.nome_municipio),''), rb1.municipio, rb2.municipio, rb3.municipio) AS e_municipio,
      -- Unidade: bd_ref first, then derive from codigo_nome_ug
      COALESCE(rb1.unidade, rb2.unidade, rb3.unidade,
        NULLIF(TRIM(regexp_replace(lc.codigo_nome_ug::text, '^\\d+\\s*-\\s*', '')), '')
      ) AS e_unidade,
      -- Fonte recurso: bd_ref
      COALESCE(rb1.fonte_recurso, rb2.fonte_recurso, rb3.fonte_recurso) AS e_fonte_recurso,
      -- Grupo despesa: bd_ref, fallback to codigo_nome_grupo
      COALESCE(rb1.grupo_despesa, rb2.grupo_despesa, rb3.grupo_despesa,
        lc.codigo_nome_grupo) AS e_grupo_despesa,
      -- Tipo despesa: bd_ref
      COALESCE(rb1.tipo_despesa, rb2.tipo_despesa, rb3.tipo_despesa) AS e_tipo_despesa,
      -- Rótulo: bd_ref, fallback heuristic from codigo_nome_projeto_atividade
      COALESCE(rb1.rotulo, rb2.rotulo, rb3.rotulo,
        CASE
          WHEN lc.codigo_nome_projeto_atividade ~* 'ambulat|hospitalar' THEN 'Assistência Hospitalar'
          WHEN lc.codigo_nome_projeto_atividade ~* 'farmac' THEN 'Assistência Farmacêutica'
          WHEN lc.codigo_nome_projeto_atividade ~* 'vigil.*sanit' THEN 'Vigilância Sanitária'
          WHEN lc.codigo_nome_projeto_atividade ~* 'vigil.*epidem|endem' THEN 'Vigilância Epidemiológica'
          WHEN lc.codigo_nome_projeto_atividade ~* 'imuniz' THEN 'Imunização'
          WHEN lc.codigo_nome_projeto_atividade ~* 'atenc.*bas|atencao.*prim' THEN 'Atenção Básica'
          WHEN lc.codigo_nome_projeto_atividade ~* 'mental|psiq' THEN 'Saúde Mental'
          WHEN lc.codigo_nome_projeto_atividade ~* 'apoio.*admin|administrativ' THEN 'Apoio Administrativo'
          WHEN lc.codigo_nome_projeto_atividade ~* 'reform|ampl|aparelh|equipam' THEN 'Investimento/Infraestrutura'
          WHEN lc.codigo_nome_projeto_atividade ~* 'emenda' THEN 'Emendas Parlamentares'
          WHEN lc.codigo_nome_projeto_atividade ~* 'laborat' THEN 'Laboratório'
          WHEN lc.codigo_nome_projeto_atividade ~* 'sangue|hemot' THEN 'Hemoterapia'
          WHEN lc.codigo_nome_projeto_atividade ~* 'oncol|cancer' THEN 'Oncologia'
          ELSE 'Outros'
        END
      ) AS e_rotulo
    FROM lc131_despesas lc
    INNER JOIN candidates c ON c.id = lc.id
    -- JOINs with tab_drs by municipio
    LEFT JOIN tab_drs  td   ON td.municipio  = norm_munic(lc.nome_municipio)
    LEFT JOIN tab_drs  td2  ON td2.municipio = norm_munic(lc.municipio)
    -- JOINs with tab_rras by municipio
    LEFT JOIN tab_rras tr   ON tr.municipio  = norm_munic(lc.nome_municipio)
    LEFT JOIN tab_rras tr2  ON tr2.municipio = norm_munic(lc.municipio)
    -- JOIN1: bd_ref by codigo_projeto_atividade
    LEFT JOIN bd_ref rb1 ON rb1.codigo = LPAD(lc.codigo_projeto_atividade::text, 6, '0')
    -- JOIN2: bd_ref by codigo_ug
    LEFT JOIN bd_ref rb2 ON rb2.codigo = LPAD(lc.codigo_ug::text, 6, '0')
    -- JOIN3: bd_ref by numeric prefix of codigo_nome_ug
    LEFT JOIN bd_ref rb3 ON rb3.codigo = LPAD(
        NULLIF(regexp_replace(split_part(lc.codigo_nome_ug::text,' ',1),'[^0-9]','','g'),''),
        6, '0')
  )
  UPDATE lc131_despesas tgt SET
    drs           = COALESCE(enriched.e_drs,           NULLIF(TRIM(tgt.drs),'')),
    rras          = COALESCE(enriched.e_rras,          NULLIF(TRIM(tgt.rras),'')),
    regiao_ad     = COALESCE(enriched.e_regiao_ad,     NULLIF(TRIM(tgt.regiao_ad),'')),
    regiao_sa     = COALESCE(enriched.e_regiao_sa,     NULLIF(TRIM(tgt.regiao_sa),'')),
    cod_ibge      = COALESCE(enriched.e_cod_ibge,      NULLIF(TRIM(tgt.cod_ibge),'')),
    municipio     = COALESCE(enriched.e_municipio,     NULLIF(TRIM(tgt.municipio),'')),
    unidade       = COALESCE(enriched.e_unidade,       NULLIF(TRIM(tgt.unidade),'')),
    fonte_recurso = COALESCE(enriched.e_fonte_recurso, NULLIF(TRIM(tgt.fonte_recurso),'')),
    grupo_despesa = COALESCE(enriched.e_grupo_despesa, NULLIF(TRIM(tgt.grupo_despesa),'')),
    tipo_despesa  = COALESCE(enriched.e_tipo_despesa,  NULLIF(TRIM(tgt.tipo_despesa),'')),
    rotulo        = COALESCE(enriched.e_rotulo,        NULLIF(TRIM(tgt.rotulo),'')),
    pago_total    = COALESCE(tgt.pago, 0) + COALESCE(tgt.pago_anos_anteriores, 0)
  FROM enriched WHERE tgt.id = enriched.id;
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected;
END;
$$;

-- 4. Recreate wrapper that calls batch in loop
CREATE OR REPLACE FUNCTION public.refresh_dashboard()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET statement_timeout = 0
AS $$
DECLARE n bigint;
BEGIN
  LOOP
    n := refresh_dashboard_batch(5000);
    RAISE NOTICE 'Batch enriched % rows', n;
    EXIT WHEN n = 0;
  END LOOP;
END;
$$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
`;

writeFileSync('scripts/rebuild-bdref-and-enrich.sql', sql, 'utf8');
console.log(`\nSQL written to scripts/rebuild-bdref-and-enrich.sql`);
console.log(`Contains:`);
console.log(`  - TRUNCATE + INSERT ${entries.length} bd_ref rows`);
console.log(`  - Clear all enriched columns`);
console.log(`  - Recreated refresh_dashboard_batch with improved fallbacks`);
console.log(`  - Recreated refresh_dashboard wrapper`);
console.log(`\nNext steps:`);
console.log(`  1. Execute this SQL in Supabase SQL Editor`);
console.log(`  2. Then call refresh_dashboard() to re-enrich all data`);
