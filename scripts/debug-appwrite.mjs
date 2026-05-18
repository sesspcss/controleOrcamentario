/**
 * Debug: testar GET simples
 */

import https from 'https';

const ENDPOINT = 'fra.cloud.appwrite.io';
const PROJECT_ID = '69ea271e000d28e3afce';
const DATABASE_ID = 'database-69ea274b00316d3d1dfb';
const API_KEY = 'standard_8834bd8610e14b14457c14af3d1ebaa4de0a89405faeb1186a02d517d251b31c125896555137773df5d8fc00f87bb0f67b032cdb5f2dea1b6d4841b9b0d46e8022df8202ccd30b5b9046bf190eb9f5c0e26501ffbc89527f94e8c95eb14c627af38568f0647b64973868741b16b8e2d0ac257b8b1a838600c24a7d6120edf204';

console.log('🔍 Testando GET no database...\n');

const options = {
  hostname: ENDPOINT,
  port: 443,
  path: `/v1/databases/${DATABASE_ID}`,
  method: 'GET',
  rejectUnauthorized: false,
  headers: {
    'X-Appwrite-Project': PROJECT_ID,
    'X-Appwrite-Key': API_KEY,
    'Content-Type': 'application/json',
    'User-Agent': 'Node.js/24.11.0',
  },
};

const req = https.request(options, (res) => {
  console.log('✅ Response Status:', res.statusCode);
  console.log('Headers:', res.headers);

  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('\nBody:', data.substring(0, 500));
    if (res.statusCode === 200) {
      try {
        const json = JSON.parse(data);
        console.log('\n📦 Database encontrado:');
        console.log('  $id:', json.$id);
        console.log('  name:', json.name);
      } catch (e) {
        console.log('(não é JSON)');
      }
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Erro:', error.message);
  console.error('Code:', error.code);
});

req.end();

// Também testar collections list
setTimeout(() => {
  console.log('\n\n🔍 Testando GET de collections...\n');

  const options2 = {
    hostname: ENDPOINT,
    port: 443,
    path: `/v1/databases/${DATABASE_ID}/collections`,
    method: 'GET',
    rejectUnauthorized: false,
    headers: {
      'X-Appwrite-Project': PROJECT_ID,
      'X-Appwrite-Key': API_KEY,
      'User-Agent': 'Node.js/24.11.0',
    },
  };

  const req2 = https.request(options2, (res) => {
    console.log('✅ Response Status:', res.statusCode);

    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        console.log(`\n📊 Collections encontradas: ${json.total}`);
        if (json.collections && json.collections.length > 0) {
          for (const col of json.collections) {
            console.log(`  - ${col.$id}`);
          }
        }
      } catch (e) {
        console.log('Body:', data.substring(0, 300));
      }
    });
  });

  req2.on('error', (error) => {
    console.error('❌ Erro:', error.message);
  });

  req2.end();
}, 2000);
