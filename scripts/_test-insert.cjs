process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https = require('https');
const AW_KEY = 'standard_8834bd8610e14b14457c14af3d1ebaa4de0a89405faeb1186a02d517d251b31c125896555137773df5d8fc00f87bb0f67b032cdb5f2dea1b6d4841b9b0d46e8022df8202ccd30b5b9046bf190eb9f5c0e26501ffbc89527f94e8c95eb14c627af38568f0647b64973868741b16b8e2d0ac257b8b1a838600c24a7d6120edf204';
const AW_PROJECT = '69ea271e000d28e3afce';
const DB = '69ea274b00316d3d1dfb';
const COLL = 'lc131_despesas';

function awReq(method, path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const opts = {
      hostname: 'fra.cloud.appwrite.io',
      path: '/v1' + path,
      method,
      headers: {
        'X-Appwrite-Project': AW_PROJECT,
        'X-Appwrite-Key': AW_KEY,
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };
    const req = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, data: d }); } });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// Test: try inserting a simple doc with all required fields
async function main() {
  // First check the collection attributes
  console.log('Checking collection attributes...');
  const coll = await awReq('GET', `/databases/${DB}/collections/${COLL}`, null);
  if (coll.data && coll.data.attributes) {
    console.log('Attributes:', coll.data.attributes.map(a => `${a.key}(${a.type},${a.required?'req':'opt'})`).join(', '));
  } else {
    console.log('Collection response:', JSON.stringify(coll.data).slice(0, 300));
  }

  // Try inserting a minimal test document
  const testDoc = {
    documentId: 'test-insert-001',
    ano_referencia: 2022,
    municipio: 'TESTE',
    nome_municipio: 'Municipio Teste',
    empenhado: 1000.0,
    liquidado: 900.0,
    pago: 800.0,
    pago_anos_anteriores: 0.0,
    pago_total: 800.0,
    fonte_simpl: 'ESTADUAL',
    grupo_simpl: 'Custeio',
  };
  // Try nested data format (Appwrite 1.x legacy)
  const testDocNested = {
    documentId: 'test-insert-002',
    data: {
      ano_referencia: 2022,
      municipio: 'TESTE',
      nome_municipio: 'Municipio Teste',
      empenhado: 1000.0,
      liquidado: 900.0,
      pago: 800.0,
      pago_anos_anteriores: 0.0,
      pago_total: 800.0,
      fonte_simpl: 'ESTADUAL',
      grupo_simpl: 'Custeio',
    }
  };
  console.log('\nTrying nested data format...');
  const r2 = await awReq('POST', `/databases/${DB}/collections/${COLL}/documents`, testDocNested);
  console.log('Status:', r2.status);
  console.log('Response:', JSON.stringify(r2.data).slice(0, 500));
}

main().catch(e => console.error('Error:', e));
