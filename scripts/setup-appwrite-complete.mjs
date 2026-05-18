/**
 * SETUP COMPLETO:
 * 1. Criar Database
 * 2. Criar Collections
 * Tudo de uma vez!
 */

import https from 'https';

const ENDPOINT = 'fra.cloud.appwrite.io';
const PROJECT_ID = '69ea271e000d28e3afce';
const API_KEY = 'standard_8834bd8610e14b14457c14af3d1ebaa4de0a89405faeb1186a02d517d251b31c125896555137773df5d8fc00f87bb0f67b032cdb5f2dea1b6d4841b9b0d46e8022df8202ccd30b5b9046bf190eb9f5c0e26501ffbc89527f94e8c95eb14c627af38568f0647b64973868741b16b8e2d0ac257b8b1a838600c24a7d6120edf204';

let DATABASE_ID = null;

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: ENDPOINT,
      port: 443,
      path: path,
      method: method,
      rejectUnauthorized: false,
      headers: {
        'X-Appwrite-Project': PROJECT_ID,
        'X-Appwrite-Key': API_KEY,
        'Content-Type': 'application/json',
        'User-Agent': 'Node.js/24.11.0',
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

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

async function createDatabase() {
  console.log('\n🚀 1️⃣  Criando Database...\n');

  try {
    const response = await makeRequest('POST', '/v1/databases', {
      databaseId: 'default',
      name: 'Controle Orçamento - Lei 131',
    });

    if (response.status === 409) {
      console.log('  ℹ️  Database "default" já existe');
      // Tentar descobrir o ID correto
      const dbResp = await makeRequest('GET', '/v1/databases');
      const dbData = JSON.parse(dbResp.body);
      if (dbData.databases.length > 0) {
        DATABASE_ID = dbData.databases[0].$id;
      } else {
        DATABASE_ID = 'default';
      }
    } else if (response.status === 201) {
      const data = JSON.parse(response.body);
      DATABASE_ID = data.$id;
      console.log(`  ✅ Database criado: ${DATABASE_ID}`);
    } else {
      console.error(`  ❌ Erro: Status ${response.status}`);
      console.error('     ', response.body.substring(0, 200));
      return false;
    }

    return true;
  } catch (error) {
    console.error('  ❌ Erro:', error.message);
    return false;
  }
}

async function createCollections() {
  console.log('\n🚀 2️⃣  Criando Collections...\n');

  const collections = [
    { id: 'lc131_despesas', name: 'Lei de Comunicações 131 - Despesas' },
    { id: 'bd_ref', name: 'Banco de Referência' },
    { id: 'tab_drs', name: 'Tabela DRS' },
    { id: 'tab_rras', name: 'Tabela RRAS' },
  ];

  let successCount = 0;

  for (const coll of collections) {
    try {
      console.log(`  Criando ${coll.id}...`);

      const response = await makeRequest(
        'POST',
        `/v1/databases/${DATABASE_ID}/collections`,
        {
          collectionId: coll.id,
          name: coll.name,
          permissions: [
            'read("any")',
            'create("any")',
            'update("any")',
            'delete("any")',
          ],
        }
      );

      if (response.status === 409) {
        console.log(`  ℹ️  ${coll.id} já existe`);
        successCount++;
      } else if (response.status === 201) {
        console.log(`  ✅ ${coll.id} criada!`);
        successCount++;
      } else {
        console.error(`  ❌ Status ${response.status}:`, response.body.substring(0, 100));
      }
    } catch (error) {
      console.error(`  ❌ Erro:`, error.message);
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  return successCount === collections.length;
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  SETUP COMPLETO DO APPWRITE                  ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  // Passo 1: Criar Database
  const dbOk = await createDatabase();
  if (!dbOk || !DATABASE_ID) {
    console.error('\n❌ Falha ao criar database');
    process.exit(1);
  }

  // Passo 2: Criar Collections
  const colsOk = await createCollections();

  // Resultado
  console.log('\n╔════════════════════════════════════════════════╗');
  if (dbOk && colsOk) {
    console.log('║  ✅ SETUP COMPLETO!                           ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    console.log('📋 Próximas etapas:');
    console.log('   1. npm run migrate-supabase-to-appwrite');
    console.log('   2. npm run dev');
    console.log('   3. Acesse http://localhost:3000\n');

    // Exibir configuração
    console.log('📝 Configuração salva em .env.local:');
    console.log(`   VITE_APPWRITE_DATABASE=${DATABASE_ID}`);
  } else {
    console.log('║  ❌ SETUP INCOMPLETO                         ║');
    console.log('╚════════════════════════════════════════════════╝\n');
  }
}

main().catch((e) => {
  console.error('❌ Erro fatal:', e.message);
  process.exit(1);
});
