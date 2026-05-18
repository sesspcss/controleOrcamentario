const https = require('https');

const ENDPOINT = 'fra.cloud.appwrite.io';
const PROJECT_ID = '69ea271e000d28e3afce';
const API_KEY = 'standard_8834bd8610e14b14457c14af3d1ebaa4de0a89405faeb1186a02d517d251b31c125896555137773df5d8fc00f87bb0f67b032cdb5f2dea1b6d4841b9b0d46e8022df8202ccd30b5b9046bf190eb9f5c0e26501ffbc89527f94e8c95eb14c627af38568f0647b64973868741b16b8e2d0ac257b8b1a838600c24a7d6120edf204';

console.log('Listando databases existentes...\n');

const options = {
  hostname: ENDPOINT,
  port: 443,
  path: '/v1/databases',
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
    console.log(`Total: ${json.total} databases\n`);

    if (json.databases && json.databases.length > 0) {
      console.log('Databases encontrados:\n');
      for (const db of json.databases) {
        console.log(`📦 ${db.$id}`);
        console.log(`   Name: ${db.name}`);
        console.log(`   Created: ${db.$createdAt}`);
        console.log('');

        // Tentar listar collections
        const colPath = `/v1/databases/${db.$id}/collections`;
        console.log(`   🔗 Collections em ${colPath}:`);

        const colOptions = {
          hostname: ENDPOINT,
          port: 443,
          path: colPath,
          method: 'GET',
          rejectUnauthorized: false,
          headers: {
            'X-Appwrite-Project': PROJECT_ID,
            'X-Appwrite-Key': API_KEY,
          },
        };

        const colReq = https.request(colOptions, (colRes) => {
          let colData = '';
          colRes.on('data', (chunk) => {
            colData += chunk;
          });
          colRes.on('end', () => {
            try {
              const colJson = JSON.parse(colData);
              if (colJson.collections && colJson.collections.length > 0) {
                for (const col of colJson.collections) {
                  console.log(`      ✅ ${col.$id}`);
                }
              } else {
                console.log('      (nenhuma collection)');
              }
            } catch (e) {
              console.log('      (erro ao listar)');
            }
          });
        });
        colReq.end();
      }

      // Instruções para usar
      console.log('\n📝 Use em .env.local:');
      const firstDb = json.databases[0];
      console.log(`   VITE_APPWRITE_DATABASE=${firstDb.$id}`);
    } else {
      console.log('❌ Nenhum database encontrado!');
      console.log('   Você precisa criar um via console Appwrite');
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Erro:', error.message);
});

req.end();
