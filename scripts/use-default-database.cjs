const https = require('https');

const ENDPOINT = 'fra.cloud.appwrite.io';
const PROJECT_ID = '69ea271e000d28e3afce';
const DATABASE_ID = 'default'; // Tentar usar default implicitamente
const API_KEY = 'standard_8834bd8610e14b14457c14af3d1ebaa4de0a89405faeb1186a02d517d251b31c125896555137773df5d8fc00f87bb0f67b032cdb5f2dea1b6d4841b9b0d46e8022df8202ccd30b5b9046bf190eb9f5c0e26501ffbc89527f94e8c95eb14c627af38568f0647b64973868741b16b8e2d0ac257b8b1a838600c24a7d6120edf204';

console.log(`Tentando usar database "default"...\n`);

// Tentar GET na database default
const options = {
  hostname: ENDPOINT,
  port: 443,
  path: `/v1/databases/${DATABASE_ID}`,
  method: 'GET',
  rejectUnauthorized: false,
  headers: {
    'X-Appwrite-Project': PROJECT_ID,
    'X-Appwrite-Key': API_KEY,
  },
};

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    const json = JSON.parse(data);

    if (res.statusCode === 200) {
      console.log(`✅ Database "default" existe!`);
      console.log(`   ID: ${json.$id}`);
      console.log(`   Name: ${json.name}`);
      console.log('\n📝 Use em .env.local:');
      console.log(`   VITE_APPWRITE_DATABASE=default`);
      
      // Tentar criar collections neste database
      createCollections(DATABASE_ID);
    } else {
      console.log(`❌ Status ${res.statusCode}`);
      console.log(JSON.stringify(json, null, 2));
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Erro:', error.message);
});

req.end();

function createCollections(dbId) {
  console.log('\n📦 Criando collections...\n');

  const collections = [
    { id: 'lc131_despesas', name: 'Lei 131 - Despesas' },
    { id: 'bd_ref', name: 'Banco Referência' },
    { id: 'tab_drs', name: 'Tabela DRS' },
    { id: 'tab_rras', name: 'Tabela RRAS' },
  ];

  let done = 0;

  for (const coll of collections) {
    setTimeout(() => {
      const body = JSON.stringify({
        collectionId: coll.id,
        name: coll.name,
        permissions: [
          'read("any")',
          'create("any")',
          'update("any")',
          'delete("any")',
        ],
      });

      const opts = {
        hostname: ENDPOINT,
        port: 443,
        path: `/v1/databases/${dbId}/collections`,
        method: 'POST',
        rejectUnauthorized: false,
        headers: {
          'X-Appwrite-Project': PROJECT_ID,
          'X-Appwrite-Key': API_KEY,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      };

      const creq = https.request(opts, (cres) => {
        let cdata = '';
        cres.on('data', (chunk) => {
          cdata += chunk;
        });
        cres.on('end', () => {
          done++;
          if (cres.statusCode === 201) {
            console.log(`   ✅ ${coll.id}`);
          } else if (cres.statusCode === 409) {
            console.log(`   ℹ️  ${coll.id} (já existe)`);
          } else {
            console.log(`   ❌ ${coll.id} (${cres.statusCode})`);
          }

          if (done === collections.length) {
            console.log('\n✅ Pronto!\n   npm run migrate-supabase-to-appwrite');
          }
        });
      });

      creq.on('error', (e) => {
        console.error(`   ❌ ${coll.id}: ${e.message}`);
        done++;
      });

      creq.write(body);
      creq.end();
    }, done * 300);
  }
}
