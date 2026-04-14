/**
 * vacuum-full.mjs
 * Executa VACUUM FULL nas tabelas principais via conexão direta (pg).
 * VACUUM não pode rodar dentro de transação — o SQL Editor do Supabase
 * não funciona para isso. Este script usa autocommit implícito do driver pg.
 *
 * USO:
 *   node scripts/vacuum-full.mjs
 */
import pg from 'pg';
const { Client } = pg;

const CONNECTION = 'postgresql://postgres:hJnO4amWjG4TmxkR@db.teikzwrfsxjipxozzhbr.supabase.co:5432/postgres';

const TABLES = [
  'public.lc131_despesas',
  'public.bd_ref',
  'public.tab_municipios',
];

async function sizeOf(client, table) {
  const { rows } = await client.query(
    `SELECT pg_size_pretty(pg_total_relation_size($1)) AS sz`, [table]
  );
  return rows[0]?.sz ?? '?';
}

async function main() {
  const client = new Client({ connectionString: CONNECTION, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Conectado.\n');

  for (const table of TABLES) {
    const before = await sizeOf(client, table);
    process.stdout.write(`VACUUM FULL ${table}  (antes: ${before}) ... `);
    const t = Date.now();
    await client.query(`VACUUM FULL ${table}`);
    const after = await sizeOf(client, table);
    console.log(`OK  depois: ${after}  (${((Date.now()-t)/1000).toFixed(0)}s)`);
  }

  console.log('\nPronto. Tamanho total do banco:');
  const { rows } = await client.query(`
    SELECT pg_size_pretty(SUM(pg_total_relation_size(schemaname||'.'||tablename))) AS total
    FROM pg_tables WHERE schemaname = 'public'
  `);
  console.log(' ', rows[0].total);

  await client.end();
}

main().catch(err => { console.error('ERRO:', err.message); process.exit(1); });
