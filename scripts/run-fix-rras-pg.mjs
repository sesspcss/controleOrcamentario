/**
 * run-fix-rras-pg.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Executa o fix de RRAS/DRS diretamente via pg (PostgreSQL), contornando o
 * painel Supabase. Necessário quando api.supabase.com está inacessível.
 *
 * PRÉ-REQUISITO:
 *   Defina a variável de ambiente DB_PASSWORD com a senha do banco.
 *   Você encontra na Supabase: Settings → Database → Database password
 *   (ou acesse pelo celular em outro network)
 *
 * Uso:
 *   $env:DB_PASSWORD="SUA_SENHA_AQUI"; node scripts/run-fix-rras-pg.mjs
 *   $env:NODE_TLS_REJECT_UNAUTHORIZED="0"; $env:DB_PASSWORD="..."; node scripts/run-fix-rras-pg.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */
import pg from 'pg';
const { Client } = pg;

const PROJECT_REF = 'teikzwrfsxjipxozzhbr';
const DB_PASSWORD = process.env.DB_PASSWORD;

if (!DB_PASSWORD) {
  console.error('\n❌ ERRO: variável DB_PASSWORD não definida.');
  console.error('   Execute: $env:DB_PASSWORD="SUA_SENHA"; node scripts/run-fix-rras-pg.mjs');
  console.error('\n   Onde encontrar a senha:');
  console.error('   → Supabase Dashboard → Settings → Database → Database password');
  console.error('   (acesse pelo celular se o painel estiver bloqueado na rede corporativa)\n');
  process.exit(1);
}

// Supabase transaction pooler (porta 6543, mais compatível com firewalls)
const CONNECTION = {
  host:     `aws-0-sa-east-1.pooler.supabase.com`,
  port:     6543,
  database: 'postgres',
  user:     `postgres.${PROJECT_REF}`,
  password: DB_PASSWORD,
  ssl:      { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
  query_timeout: 300000,
};

// Fallback: conexão direta ao banco (porta 5432)
const CONNECTION_DIRECT = {
  host:     `db.${PROJECT_REF}.supabase.co`,
  port:     5432,
  database: 'postgres',
  user:     'postgres',
  password: DB_PASSWORD,
  ssl:      { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
  query_timeout: 300000,
};

async function connectWithFallback() {
  // Tenta pooler primeiro
  try {
    console.log('Conectando via transaction pooler (porta 6543)...');
    const client = new Client(CONNECTION);
    await client.connect();
    console.log('✅ Conectado via pooler.\n');
    return client;
  } catch (err) {
    console.warn(`⚠️  Pooler falhou: ${err.message}`);
  }
  // Tenta conexão direta
  try {
    console.log('Tentando conexão direta (porta 5432)...');
    const client = new Client(CONNECTION_DIRECT);
    await client.connect();
    console.log('✅ Conectado via conexão direta.\n');
    return client;
  } catch (err) {
    console.error(`❌ Conexão direta também falhou: ${err.message}`);
    throw new Error('Não foi possível conectar ao banco. Verifique a senha e a conectividade.');
  }
}

async function run() {
  const client = await connectWithFallback();

  try {
    // ─────────────────────────────────────────────────────────────────────
    // PASSO 1: Force-update DRS/RRAS via tab_municipios para TODAS as linhas
    // ─────────────────────────────────────────────────────────────────────
    console.log('Passo 1: Atualizando DRS/RRAS por nome_municipio...');
    const r1 = await client.query(`
      UPDATE public.lc131_despesas tgt
      SET
        drs       = tm.drs,
        rras      = tm.rras,
        regiao_ad = tm.regiao_ad,
        regiao_sa = tm.regiao_sa,
        cod_ibge  = tm.cod_ibge
      FROM public.tab_municipios tm
      WHERE tm.municipio = norm_munic(tgt.nome_municipio)
        AND tm.drs IS NOT NULL
    `);
    console.log(`   → ${r1.rowCount} linhas atualizadas\n`);

    // ─────────────────────────────────────────────────────────────────────
    // PASSO 2: Fallback por campo municipio (onde ainda tem DRS vazio ou RRAS numérico)
    // ─────────────────────────────────────────────────────────────────────
    console.log('Passo 2: Fallback por campo municipio (DRS vazio ou RRAS numérico)...');
    const r2 = await client.query(`
      UPDATE public.lc131_despesas tgt
      SET
        drs       = tm.drs,
        rras      = tm.rras,
        regiao_ad = tm.regiao_ad,
        regiao_sa = tm.regiao_sa,
        cod_ibge  = tm.cod_ibge
      FROM public.tab_municipios tm
      WHERE tm.municipio = norm_munic(tgt.municipio)
        AND tm.drs IS NOT NULL
        AND (COALESCE(TRIM(tgt.drs), '') = '' OR tgt.rras ~ '^[0-9]+$')
    `);
    console.log(`   → ${r2.rowCount} linhas atualizadas\n`);

    // ─────────────────────────────────────────────────────────────────────
    // PASSO 3: Normalizar RRAS numérico residual: '6' → 'RRAS 06'
    // ─────────────────────────────────────────────────────────────────────
    console.log('Passo 3: Normalizando RRAS numérico residual...');
    const r3 = await client.query(`
      UPDATE public.lc131_despesas
      SET rras = 'RRAS ' || LPAD(rras, 2, '0')
      WHERE rras ~ '^[0-9]{1,2}$'
    `);
    console.log(`   → ${r3.rowCount} linhas normalizadas\n`);

    // ─────────────────────────────────────────────────────────────────────
    // PASSO 4: Atualizar função refresh_dashboard_batch para capturar RRAS numérico futuro
    // ─────────────────────────────────────────────────────────────────────
    console.log('Passo 4: Atualizando função refresh_dashboard_batch...');
    await client.query(`
      CREATE OR REPLACE FUNCTION public.refresh_dashboard_batch(
        p_batch_size integer DEFAULT 5000
      )
      RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public SET statement_timeout = 300000
      AS $func$
      DECLARE rows_affected bigint;
      BEGIN
        WITH candidates AS (
          SELECT id FROM lc131_despesas
          WHERE COALESCE(TRIM(drs), '')       = ''
             OR COALESCE(TRIM(rras), '')      = ''
             OR COALESCE(TRIM(regiao_ad), '') = ''
             OR COALESCE(TRIM(rotulo), '')    = ''
             OR rras ~ '^[0-9]+$'
          LIMIT p_batch_size
        ),
        enriched AS (
          SELECT
            lc.id,
            NULLIF(TRIM(COALESCE(tm1.drs,  tm2.drs,  rb1.drs,  rb2.drs,  rb3.drs )), '') AS e_drs,
            NULLIF(TRIM(COALESCE(tm1.rras, tm2.rras                                )), '') AS e_rras,
            COALESCE(tm1.regiao_ad, tm2.regiao_ad, rb1.regiao_ad, rb2.regiao_ad, rb3.regiao_ad) AS e_regiao_ad,
            COALESCE(tm1.regiao_sa, tm2.regiao_sa, rb1.regiao_sa, rb2.regiao_sa, rb3.regiao_sa) AS e_regiao_sa,
            COALESCE(tm1.cod_ibge,  tm2.cod_ibge,  rb1.cod_ibge,  rb2.cod_ibge,  rb3.cod_ibge)  AS e_cod_ibge,
            COALESCE(lc.nome_municipio, tm1.municipio_orig, tm2.municipio_orig, rb1.municipio, rb2.municipio, rb3.municipio) AS e_municipio,
            COALESCE(rb1.unidade,       rb2.unidade,       rb3.unidade)       AS e_unidade,
            COALESCE(rb1.fonte_recurso, rb2.fonte_recurso, rb3.fonte_recurso) AS e_fonte,
            COALESCE(rb1.grupo_despesa, rb2.grupo_despesa, rb3.grupo_despesa) AS e_grupo,
            COALESCE(rb1.tipo_despesa,  rb2.tipo_despesa,  rb3.tipo_despesa)  AS e_tipo,
            COALESCE(rb1.rotulo, rb2.rotulo, rb3.rotulo,
              CASE
                WHEN lc.codigo_nome_projeto_atividade ILIKE '%ambulat%'
                  OR lc.codigo_nome_projeto_atividade ILIKE '%hospitalar%'
                  OR lc.codigo_nome_projeto_atividade ILIKE '%rede%propria%'
                  OR lc.codigo_nome_projeto_atividade ILIKE '%bata cinza%'
                  OR lc.codigo_nome_projeto_atividade ILIKE '%UNICAMP%'       THEN 'Assistência Hospitalar'
                WHEN lc.codigo_nome_projeto_atividade ILIKE '%farmac%'
                  OR lc.codigo_nome_projeto_atividade ILIKE '%medicamento%'   THEN 'Assistência Farmacêutica'
                WHEN lc.codigo_nome_projeto_atividade ILIKE '%vigil%'         THEN 'Vigilância em Saúde'
                WHEN lc.codigo_nome_projeto_atividade ILIKE '%aparelh%'
                  OR lc.codigo_nome_projeto_atividade ILIKE '%equip%'
                  OR lc.codigo_nome_projeto_atividade ILIKE '%reform%'
                  OR lc.codigo_nome_projeto_atividade ILIKE '%construc%'      THEN 'Infraestrutura'
                WHEN lc.codigo_nome_projeto_atividade ILIKE '%admin%'
                  OR lc.codigo_nome_projeto_atividade ILIKE '%conselho%'      THEN 'Gestão e Administração'
                WHEN lc.codigo_nome_projeto_atividade ILIKE '%emenda%'        THEN 'Emendas Parlamentares'
                WHEN lc.codigo_nome_projeto_atividade ILIKE '%judicial%'
                  OR lc.codigo_nome_projeto_atividade ILIKE '%demanda%jud%'   THEN 'Demandas Judiciais'
                WHEN lc.codigo_nome_projeto_atividade ILIKE '%subvenc%'
                  OR lc.codigo_nome_projeto_atividade ILIKE '%filantrop%'     THEN 'Entidades Filantrópicas'
                WHEN lc.codigo_nome_projeto_atividade ILIKE '%resid%med%'
                  OR lc.codigo_nome_projeto_atividade ILIKE '%capacit%'       THEN 'Formação e Capacitação'
                WHEN lc.codigo_nome_projeto_atividade ILIKE '%descentraliz%'
                  OR lc.codigo_nome_projeto_atividade ILIKE '%prisional%'     THEN 'Atenção Descentralizada'
                WHEN lc.codigo_nome_projeto_atividade ILIKE '%publicidade%'   THEN 'Comunicação'
                ELSE 'Outros'
              END
            ) AS e_rotulo
          FROM lc131_despesas lc
          INNER JOIN candidates c ON c.id = lc.id
          LEFT JOIN tab_municipios tm1 ON tm1.municipio = norm_munic(lc.nome_municipio)
          LEFT JOIN tab_municipios tm2 ON tm2.municipio = norm_munic(lc.municipio)
          LEFT JOIN bd_ref rb1 ON rb1.codigo = LPAD(lc.codigo_projeto_atividade::text, 6, '0')
          LEFT JOIN bd_ref rb2 ON rb2.codigo = LPAD(lc.codigo_ug::text, 6, '0')
          LEFT JOIN bd_ref rb3 ON rb3.codigo = LPAD(
              NULLIF(regexp_replace(split_part(lc.codigo_nome_ug::text, ' ', 1), '[^0-9]', '', 'g'), ''),
              6, '0')
        )
        UPDATE lc131_despesas tgt
        SET
          drs           = COALESCE(enriched.e_drs,       NULLIF(TRIM(tgt.drs), '')),
          rras          = COALESCE(enriched.e_rras,       NULLIF(TRIM(tgt.rras), '')),
          regiao_ad     = COALESCE(enriched.e_regiao_ad,  NULLIF(TRIM(tgt.regiao_ad), '')),
          regiao_sa     = COALESCE(enriched.e_regiao_sa,  NULLIF(TRIM(tgt.regiao_sa), '')),
          cod_ibge      = COALESCE(enriched.e_cod_ibge,   NULLIF(TRIM(tgt.cod_ibge), '')),
          municipio     = COALESCE(enriched.e_municipio,  NULLIF(TRIM(tgt.municipio), '')),
          unidade       = COALESCE(enriched.e_unidade,    NULLIF(TRIM(tgt.unidade), '')),
          fonte_recurso = COALESCE(enriched.e_fonte,      NULLIF(TRIM(tgt.fonte_recurso), '')),
          grupo_despesa = COALESCE(enriched.e_grupo,      NULLIF(TRIM(tgt.grupo_despesa), ''), tgt.codigo_nome_grupo),
          tipo_despesa  = COALESCE(enriched.e_tipo,       NULLIF(TRIM(tgt.tipo_despesa), '')),
          rotulo        = COALESCE(enriched.e_rotulo,     NULLIF(TRIM(tgt.rotulo), '')),
          pago_total    = COALESCE(tgt.pago, 0) + COALESCE(tgt.pago_anos_anteriores, 0)
        FROM enriched
        WHERE tgt.id = enriched.id;

        GET DIAGNOSTICS rows_affected = ROW_COUNT;
        RETURN rows_affected;
      END;
      $func$;

      GRANT EXECUTE ON FUNCTION public.refresh_dashboard_batch(integer) TO anon, authenticated;
    `);
    console.log('   → Função atualizada\n');

    // ─────────────────────────────────────────────────────────────────────
    // PASSO 5: Remover tabelas obsoletas
    // ─────────────────────────────────────────────────────────────────────
    console.log('Passo 5: Removendo tabelas obsoletas tab_drs e tab_rras...');
    await client.query(`DROP TABLE IF EXISTS public.tab_drs CASCADE`);
    await client.query(`DROP TABLE IF EXISTS public.tab_rras CASCADE`);
    console.log('   → Tabelas removidas\n');

    // ─────────────────────────────────────────────────────────────────────
    // PASSO 6: Verificação final
    // ─────────────────────────────────────────────────────────────────────
    console.log('Passo 6: Verificação final...\n');

    const rVerify = await client.query(`
      SELECT
        ano_referencia,
        COUNT(*)          AS total,
        COUNT(drs)        AS com_drs,
        COUNT(rras)       AS com_rras,
        ROUND(COUNT(drs)::numeric/COUNT(*)*100, 1) AS pct_drs
      FROM public.lc131_despesas
      GROUP BY ano_referencia ORDER BY ano_referencia
    `);

    console.log('Por ano:');
    console.table(rVerify.rows);

    const rRras = await client.query(`
      SELECT DISTINCT rras
      FROM public.lc131_despesas
      WHERE rras IS NOT NULL AND rras <> ''
      ORDER BY rras
    `);
    const rrasValues = rRras.rows.map(r => r.rras);
    const badValues  = rrasValues.filter(v => /^\d+$/.test(v));

    console.log('\nValores distintos de RRAS:', rrasValues);

    if (badValues.length > 0) {
      console.warn(`\n⚠️  Ainda existem ${badValues.length} valor(es) numérico(s) puro(s): ${badValues.join(', ')}`);
    } else {
      console.log('\n✅ Todos os valores de RRAS estão no formato correto (RRAS XX)!');
    }

    // Notify PostgREST para recarregar schema
    await client.query(`NOTIFY pgrst, 'reload schema'`);
    console.log('\n✅ Schema recarregado. Pronto!\n');

  } finally {
    await client.end();
  }
}

run().catch(err => {
  console.error('\n❌ Erro fatal:', err.message);
  process.exit(1);
});
