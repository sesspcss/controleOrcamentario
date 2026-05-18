'use strict';
/**
 * Setup Appwrite Collections - Creates attributes and indexes for lc131_despesas
 * Run: node scripts/setup-appwrite-collections.cjs
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // bypass corporate proxy SSL
const https = require('https');

const PROJECT_ID = '69ea271e000d28e3afce';
const DATABASE_ID = '69ea274b00316d3d1dfb';
const API_KEY = 'standard_8834bd8610e14b14457c14af3d1ebaa4de0a89405faeb1186a02d517d251b31c125896555137773df5d8fc00f87bb0f67b032cdb5f2dea1b6d4841b9b0d46e8022df8202ccd30b5b9046bf190eb9f5c0e26501ffbc89527f94e8c95eb14c627af38568f0647b64973868741b16b8e2d0ac257b8b1a838600c24a7d6120edf204';
const ENDPOINT = 'https://fra.cloud.appwrite.io/v1';

function awReq(method, path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const url = new URL(ENDPOINT + path);
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'X-Appwrite-Project': PROJECT_ID,
        'X-Appwrite-Key': API_KEY,
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };
    const req = https.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, data: d }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function createCollection(id, name) {
  const r = await awReq('POST', `/databases/${DATABASE_ID}/collections`, {
    collectionId: id, name, permissions: [], documentSecurity: false,
  });
  if (r.status === 409 || r.data?.type === 'collection_already_exists') {
    console.log(`  Collection ${id} already exists`);
  } else if (r.status === 201) {
    console.log(`  Created collection: ${id}`);
  } else {
    console.warn(`  WARN collection ${id}: ${r.status} ${JSON.stringify(r.data?.message || r.data)}`);
  }
}

async function createAttr(collId, type, payload) {
  const r = await awReq('POST', `/databases/${DATABASE_ID}/collections/${collId}/attributes/${type}`, payload);
  if (r.status === 202 || r.status === 201) {
    process.stdout.write('.');
  } else if (r.data?.type === 'attribute_already_exists') {
    process.stdout.write('s');
  } else {
    console.warn(`\n  WARN attr ${payload.key}: ${r.status} ${JSON.stringify(r.data?.message || r.data)}`);
  }
  await sleep(150);
}

async function waitReady(collId) {
  for (let i = 0; i < 60; i++) {
    const r = await awReq('GET', `/databases/${DATABASE_ID}/collections/${collId}/attributes?limit=100`);
    if (r.status !== 200) { await sleep(3000); continue; }
    const attrs = r.data.attributes || [];
    const pending = attrs.filter(a => a.status !== 'available' && a.status !== 'deleting');
    if (pending.length === 0) { console.log(`\n  All ${attrs.length} attributes ready`); return; }
    process.stdout.write(`\r  Waiting attributes... ${pending.length} pending   `);
    await sleep(3000);
  }
  throw new Error('Timeout waiting for attributes');
}

async function createIndex(collId, key, attributes, type = 'key', orders = []) {
  const r = await awReq('POST', `/databases/${DATABASE_ID}/collections/${collId}/indexes`, {
    key, type, attributes, orders,
  });
  if (r.status === 202 || r.status === 201) {
    console.log(`  Creating index: ${key}`);
  } else if (r.data?.type === 'index_already_exists') {
    console.log(`  Index ${key} already exists`);
  } else {
    console.warn(`  WARN index ${key}: ${r.status} ${JSON.stringify(r.data?.message || r.data)}`);
  }
  await sleep(500);
}

async function main() {
  console.log('=== Appwrite Collections Setup ===\n');

  // 1. Create cache collection (for pre-computed aggregations)
  console.log('1. cache collection...');
  await createCollection('cache', 'Cache Dados Pre-computados');
  process.stdout.write('   Attributes: ');
  await createAttr('cache', 'string', { key: 'data', size: 131072, required: false }); // 128KB JSON
  await createAttr('cache', 'string', { key: 'cache_key', size: 100, required: false });
  await createAttr('cache', 'string', { key: 'updated_at', size: 30, required: false });
  console.log(' done');
  await waitReady('cache');

  // 2. lc131_despesas attributes
  console.log('\n2. lc131_despesas attributes...');
  const C = 'lc131_despesas';
  process.stdout.write('   Integer: ');
  await createAttr(C, 'integer', { key: 'ano_referencia', required: false });
  console.log(' done');

  process.stdout.write('   Floats: ');
  for (const k of ['empenhado','liquidado','pago','pago_anos_anteriores','pago_total']) {
    await createAttr(C, 'float', { key: k, required: false });
  }
  console.log(' done');

  process.stdout.write('   Strings: ');
  const stringAttrs = [
    ['municipio', 200], ['nome_municipio', 200],
    ['drs', 200], ['rras', 100], ['regiao_ad', 200], ['regiao_sa', 200],
    ['cod_ibge', 20],
    ['codigo_nome_uo', 400], ['codigo_ug', 20], ['codigo_nome_ug', 400],
    ['codigo_projeto_atividade', 50], ['codigo_nome_projeto_atividade', 500],
    ['codigo_nome_fonte_recurso', 500], ['fonte_recurso', 100],
    ['codigo_nome_grupo', 200], ['grupo_despesa', 100],
    ['codigo_nome_elemento', 200], ['codigo_elemento', 50],
    ['codigo_nome_favorecido', 500], ['codigo_favorecido', 50],
    ['descricao_processo', 1000], ['numero_processo', 100],
    ['unidade', 300], ['rotulo', 200],
    ['tipo_despesa', 200], ['tipo_despesa_classif', 200],
    ['fonte_simpl', 20],    // pre-computed: FEDERAL or ESTADUAL
    ['grupo_simpl', 50],    // pre-computed: Custeio, Pessoal, Investimento, etc.
  ];
  for (const [key, size] of stringAttrs) {
    await createAttr(C, 'string', { key, size, required: false });
  }
  console.log(' done');

  console.log('\n   Waiting for all attributes to be ready...');
  await waitReady(C);

  // 3. Create indexes
  console.log('\n3. Creating indexes...');
  await createIndex(C, 'idx_ano',            ['ano_referencia']);
  await createIndex(C, 'idx_drs',            ['drs']);
  await createIndex(C, 'idx_rras',           ['rras']);
  await createIndex(C, 'idx_municipio',      ['municipio']);
  await createIndex(C, 'idx_tipo_despesa',   ['tipo_despesa']);
  await createIndex(C, 'idx_grupo_despesa',  ['grupo_despesa']);
  await createIndex(C, 'idx_fonte_simpl',    ['fonte_simpl']);
  await createIndex(C, 'idx_rotulo',         ['rotulo']);
  await createIndex(C, 'idx_cod_favorecido', ['codigo_favorecido']);
  await createIndex(C, 'idx_ano_drs',        ['ano_referencia', 'drs'],       'key', ['ASC','ASC']);
  await createIndex(C, 'idx_ano_municipio',  ['ano_referencia', 'municipio'], 'key', ['ASC','ASC']);

  console.log('\n=== Setup complete! Run migrate-to-appwrite.cjs next ===');
}

main().catch(e => { console.error('\nFATAL:', e.message); process.exit(1); });
