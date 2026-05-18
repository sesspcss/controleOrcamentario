/**
 * Cria índices na collection lc131_despesas para queries rápidas.
 * Run: node scripts/_create-indexes.cjs
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https = require('https');

const ENDPOINT    = 'fra.cloud.appwrite.io';
const PROJECT_ID  = '69ea271e000d28e3afce';
const DATABASE_ID = '69ea274b00316d3d1dfb';
const API_KEY     = 'standard_8834bd8610e14b14457c14af3d1ebaa4de0a89405faeb1186a02d517d251b31c125896555137773df5d8fc00f87bb0f67b032cdb5f2dea1b6d4841b9b0d46e8022df8202ccd30b5b9046bf190eb9f5c0e26501ffbc89527f94e8c95eb14c627af38568f0647b64973868741b16b8e2d0ac257b8b1a838600c24a7d6120edf204';

function awReq(method, path, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: ENDPOINT, port: 443, path: '/v1' + path, method,
      rejectUnauthorized: false,
      headers: {
        'X-Appwrite-Project': PROJECT_ID, 'X-Appwrite-Key': API_KEY,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(opts, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', e => resolve({ status: 0, body: e.message }));
    if (data) req.write(data);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const INDEXES = [
  { key: 'idx_ano',         type: 'key',      attributes: ['ano_referencia'],     orders: ['ASC'] },
  { key: 'idx_drs',         type: 'key',      attributes: ['drs'],                orders: ['ASC'] },
  { key: 'idx_rras',        type: 'key',      attributes: ['rras'],               orders: ['ASC'] },
  { key: 'idx_regiao_ad',   type: 'key',      attributes: ['regiao_ad'],          orders: ['ASC'] },
  { key: 'idx_regiao_sa',   type: 'key',      attributes: ['regiao_sa'],          orders: ['ASC'] },
  { key: 'idx_municipio',   type: 'key',      attributes: ['municipio'],          orders: ['ASC'] },
  { key: 'idx_tipo',        type: 'key',      attributes: ['tipo_despesa'],       orders: ['ASC'] },
  { key: 'idx_grupo',       type: 'key',      attributes: ['codigo_nome_grupo'],  orders: ['ASC'] },
  { key: 'idx_rotulo',      type: 'key',      attributes: ['rotulo'],             orders: ['ASC'] },
  { key: 'idx_fonte_simpl', type: 'key',      attributes: ['fonte_simpl'],        orders: ['ASC'] },
  { key: 'idx_grupo_simpl', type: 'key',      attributes: ['grupo_simpl'],        orders: ['ASC'] },
  { key: 'idx_empenhado',   type: 'key',      attributes: ['empenhado'],          orders: ['DESC'] },
  { key: 'idx_ano_drs',     type: 'key',      attributes: ['ano_referencia', 'drs'], orders: ['ASC', 'ASC'] },
  { key: 'idx_ano_munic',   type: 'key',      attributes: ['ano_referencia', 'municipio'], orders: ['ASC', 'ASC'] },
];

async function main() {
  console.log('=== Criando Índices Appwrite ===\n');
  const base = `/databases/${DATABASE_ID}/collections/lc131_despesas/indexes`;

  // Get existing indexes first
  const existing = await awReq('GET', base);
  let existingKeys = [];
  try {
    const j = JSON.parse(existing.body);
    existingKeys = (j.indexes || []).map(i => i.key);
    console.log('Índices existentes:', existingKeys.join(', ') || 'nenhum');
  } catch { /* ok */ }

  for (const idx of INDEXES) {
    if (existingKeys.includes(idx.key)) {
      console.log(`[${idx.key}] Já existe — pulando.`);
      continue;
    }
    const r = await awReq('POST', base, idx);
    if (r.status === 201 || r.status === 200) {
      console.log(`[${idx.key}] Criado.`);
    } else {
      const j = JSON.parse(r.body);
      console.warn(`[${idx.key}] WARN ${r.status}: ${j.message}`);
    }
    await sleep(200); // small delay between index creations
  }

  console.log('\n=== Índices concluídos! ===');
  console.log('Nota: índices ficam no estado "processing" por alguns minutos no Appwrite.');
}

main().catch(console.error);
