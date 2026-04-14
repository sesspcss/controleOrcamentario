/**
 * run-enrich-pg.mjs
 * ─────────────────────────────────────────────────────────────────
 * Roda o enriquecimento de tipo_despesa em lotes via conexão
 * PostgreSQL direta (porta 5432) — sem passar pelo proxy corporativo.
 *
 * USO:
 *   node scripts/run-enrich-pg.mjs "postgresql://postgres:[SENHA]@db.teikzwrfsxjipxozzhbr.supabase.co:5432/postgres"
 *
 * Obtenha a senha em:
 *   Supabase Dashboard → Settings → Database → Connection string → URI
 * ─────────────────────────────────────────────────────────────────
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client } = require('pg');

const CONNECTION_STRING = process.argv[2];
if (!CONNECTION_STRING || !CONNECTION_STRING.startsWith('postgresql://')) {
  console.error('Uso: node scripts/run-enrich-pg.mjs "postgresql://postgres:[SENHA]@db.teikzwrfsxjipxozzhbr.supabase.co:5432/postgres"');
  console.error('\nObtenha a senha em: Supabase Dashboard → Settings → Database → Connection string');
  process.exit(1);
}

const BATCH_SIZE = 5000;

const client = new Client({
  connectionString: CONNECTION_STRING,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 0,
  query_timeout: 0,
});

async function main() {
  console.log('Conectando ao PostgreSQL...');
  await client.connect();
  console.log('✅ Conectado!');

  // Garantir função norm_tipo_desc
  await client.query(`
    CREATE OR REPLACE FUNCTION public.norm_tipo_desc(p text)
    RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
      SELECT upper(trim(regexp_replace(
        translate(p,
          'áàãâäéèêëíìîïóòõôöúùûüçÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ',
          'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'),
        '\\s+', ' ', 'g')))
    $$;
  `);
  console.log('✅ Função norm_tipo_desc garantida.');

  // Preview
  const preview = await client.query(`
    SELECT
      COUNT(*) AS total_lc131,
      COUNT(DISTINCT norm_tipo_desc(d.descricao_processo)) AS distinct_descricao_norm,
      (SELECT COUNT(*) FROM tipo_despesa_ref) AS tipo_despesa_ref_count,
      SUM(CASE WHEN tdr.tipo_despesa IS NOT NULL THEN 1 ELSE 0 END) AS will_update
    FROM lc131_despesas d
    LEFT JOIN tipo_despesa_ref tdr
      ON norm_tipo_desc(d.descricao_processo) = tdr.descricao_processo_norm;
  `);
  const p = preview.rows[0];
  console.log(`\nPreview:`);
  console.log(`  Total lc131_despesas:  ${Number(p.total_lc131).toLocaleString('pt-BR')}`);
  console.log(`  Desc. normalizadas:    ${Number(p.distinct_descricao_norm).toLocaleString('pt-BR')}`);
  console.log(`  Entradas em ref:       ${Number(p.tipo_despesa_ref_count).toLocaleString('pt-BR')}`);
  console.log(`  Registros p/ atualizar:${Number(p.will_update).toLocaleString('pt-BR')}`);
  console.log('');

  // UPDATE em lotes
  let totalUpdated = 0;
  let iteration = 0;

  while (true) {
    iteration++;
    const res = await client.query(`
      WITH to_update AS (
        SELECT d.id, tdr.tipo_despesa
        FROM lc131_despesas d
        INNER JOIN tipo_despesa_ref tdr
          ON norm_tipo_desc(d.descricao_processo) = tdr.descricao_processo_norm
        WHERE (d.tipo_despesa IS NULL OR d.tipo_despesa = '' OR d.tipo_despesa IS DISTINCT FROM tdr.tipo_despesa)
          AND tdr.tipo_despesa IS NOT NULL
          AND tdr.tipo_despesa <> ''
        LIMIT $1
      )
      UPDATE lc131_despesas d
      SET tipo_despesa = to_update.tipo_despesa
      FROM to_update
      WHERE d.id = to_update.id;
    `, [BATCH_SIZE]);

    const count = res.rowCount;
    totalUpdated += count;
    process.stdout.write(`\r  Batch ${iteration}: +${count} (total: ${totalUpdated.toLocaleString('pt-BR')})   `);

    if (count < BATCH_SIZE) break;
  }

  console.log(`\n\n✅ Enriquecimento concluído! Total atualizado: ${totalUpdated.toLocaleString('pt-BR')}`);

  // Distribuição final
  const dist = await client.query(`
    SELECT tipo_despesa, COUNT(*) AS registros
    FROM lc131_despesas
    WHERE tipo_despesa IS NOT NULL AND tipo_despesa <> ''
    GROUP BY tipo_despesa
    ORDER BY registros DESC
    LIMIT 60;
  `);
  console.log('\nDistribuição final dos tipos:');
  dist.rows.forEach(r => console.log(`  ${String(r.registros).padStart(8)}  ${r.tipo_despesa}`));

  await client.end();
}

main().catch(async e => {
  console.error('\n❌ Erro:', e.message);
  await client.end().catch(() => {});
  process.exit(1);
});
