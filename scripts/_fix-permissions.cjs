/**
 * Fix Appwrite collection permissions: add read("any") + disable documentSecurity
 * so the client SDK (unauthenticated) can read lc131_despesas documents.
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
        'X-Appwrite-Project': PROJECT_ID,
        'X-Appwrite-Key': API_KEY,
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

const COLLECTIONS = ['lc131_despesas', 'cache', 'bd_ref', 'tab_drs', 'tab_rras'];

async function main() {
  console.log('=== Fix Appwrite Collection Permissions ===\n');

  for (const collId of COLLECTIONS) {
    // 1. GET current collection info
    const getRes = await awReq('GET', `/databases/${DATABASE_ID}/collections/${collId}`);
    if (getRes.status !== 200) {
      console.log(`[${collId}] GET failed: ${getRes.status} ${getRes.body.slice(0,100)}`);
      continue;
    }
    const coll = JSON.parse(getRes.body);
    console.log(`[${collId}] Current permissions: ${JSON.stringify(coll['$permissions'])}`);
    console.log(`[${collId}] documentSecurity: ${coll.documentSecurity}`);

    if (coll.documentSecurity === false && coll['$permissions'] && coll['$permissions'].includes('read("any")')) {
      console.log(`[${collId}] Already correct — skipping.\n`);
      continue;
    }

    // 2. PUT updated permissions (documentSecurity=false + read("any"))
    const updateBody = {
      name: coll.name,
      permissions: ['read("any")', 'create("any")', 'update("any")', 'delete("any")'],
      documentSecurity: false,
      enabled: coll.enabled !== false,
    };
    const putRes = await awReq('PUT', `/databases/${DATABASE_ID}/collections/${collId}`, updateBody);
    if (putRes.status === 200) {
      console.log(`[${collId}] Updated successfully.\n`);
    } else {
      console.log(`[${collId}] PUT failed: ${putRes.status} ${putRes.body.slice(0,200)}\n`);
    }
  }

  // 3. Quick verify: try to list documents without API key (simulating client SDK)
  console.log('=== Verifying client-side read access ===');
  const verifyRes = await new Promise((resolve) => {
    const opts = {
      hostname: ENDPOINT, port: 443,
      path: `/v1/databases/${DATABASE_ID}/collections/lc131_despesas/documents?queries[0]=limit(1)`,
      method: 'GET',
      rejectUnauthorized: false,
      headers: {
        'X-Appwrite-Project': PROJECT_ID,
        // No API key — simulating unauthenticated client SDK
      },
    };
    const req = https.request(opts, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', e => resolve({ status: 0, body: e.message }));
    req.end();
  });
  console.log(`Client-side read: ${verifyRes.status}`);
  if (verifyRes.status === 200) {
    console.log('OK — documents are publicly readable!');
    const j = JSON.parse(verifyRes.body);
    console.log(`  total: ${j.total}, returned: ${j.documents?.length}`);
  } else {
    console.log('STILL FAILING:', verifyRes.body.slice(0, 200));
  }
}

main().catch(console.error);
