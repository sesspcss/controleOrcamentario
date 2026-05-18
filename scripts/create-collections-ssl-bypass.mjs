/**
 * Criar collections - Bypass SSL
 */

import https from 'https';

const ENDPOINT = 'fra.cloud.appwrite.io';
const PROJECT_ID = '69ea271e000d28e3afce';
const DATABASE_ID = 'database-69ea274b00316d3d1dfb';
const API_KEY = 'standard_8834bd8610e14b14457c14af3d1ebaa4de0a89405faeb1186a02d517d251b31c125896555137773df5d8fc00f87bb0f67b032cdb5f2dea1b6d4841b9b0d46e8022df8202ccd30b5b9046bf190eb9f5c0e26501ffbc89527f94e8c95eb14c627af38568f0647b64973868741b16b8e2d0ac257b8b1a838600c24a7d6120edf204';

const collections = [
  { id: 'lc131_despesas', name: 'Lei de Comunicações 131 - Despesas' },
  { id: 'bd_ref', name: 'Banco de Referência' },
  { id: 'tab_drs', name: 'Tabela DRS' },
  { id: 'tab_rras', name: 'Tabela RRAS' },
];

// Agent para fazer requisições HTTPS com controle de SSL
function makeRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: ENDPOINT,
      port: 443,
      path: path,
      method: method,
      rejectUnauthorized: false, // ⚠️ Desabilita verificação SSL
      headers: {
        'X-Appwrite-Project': PROJECT_ID,
        'X-Appwrite-Key': API_KEY,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: data,
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

async function createCollection(collDef) {
  try {
    console.log(`  Criando ${collDef.id}...`);

    const path = `/v1/databases/${DATABASE_ID}/collections`;
    const body = {
      collectionId: collDef.id,
      name: collDef.name,
      permissions: [
        'read("any")',
        'create("any")',
        'update("any")',
        'delete("any")',
      ],
    };

    const response = await makeRequest('POST', path, body);

    if (response.status === 409) {
      console.log(`  ℹ️  ${collDef.id} já existe`);
      return true;
    }

    if (response.status === 201) {
      console.log(`  ✅ ${collDef.id} criada!`);
      return true;
    }

    console.error(
      `  ❌ Erro ao criar ${collDef.id}: Status ${response.status}`
    );
    console.error('    Resposta:', response.body.substring(0, 200));
    return false;
  } catch (error) {
    console.error(`  ❌ Erro ao criar ${collDef.id}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('\n🚀 Criando Collections no Appwrite...\n');

  let successCount = 0;
  for (const coll of collections) {
    const ok = await createCollection(coll);
    if (ok) successCount++;
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n✅ ${successCount}/${collections.length} collections criadas!`);
  if (successCount === collections.length) {
    console.log('\n🚀 Pronto para migrar dados:');
    console.log('   npm run migrate-supabase-to-appwrite');
  }
}

main().catch((e) => {
  console.error('❌ Erro fatal:', e.message);
  process.exit(1);
});
