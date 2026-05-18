/**
 * Descobrir o database ID correto
 */

import https from 'https';

const ENDPOINT = 'fra.cloud.appwrite.io';
const PROJECT_ID = '69ea271e000d28e3afce';
const API_KEY = 'standard_8834bd8610e14b14457c14af3d1ebaa4de0a89405faeb1186a02d517d251b31c125896555137773df5d8fc00f87bb0f67b032cdb5f2dea1b6d4841b9b0d46e8022df8202ccd30b5b9046bf190eb9f5c0e26501ffbc89527f94e8c95eb14c627af38568f0647b64973868741b16b8e2d0ac257b8b1a838600c24a7d6120edf204';

console.log('🔍 Descobrindo database_id correto...\n');

const options = {
  hostname: ENDPOINT,
  port: 443,
  path: '/v1/databases',
  method: 'GET',
  rejectUnauthorized: false,
  headers: {
    'X-Appwrite-Project': PROJECT_ID,
    'X-Appwrite-Key': API_KEY,
    'User-Agent': 'Node.js/24.11.0',
  },
};

const req = https.request(options, (res) => {
  console.log('✅ Response Status:', res.statusCode, '\n');

  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      
      if (json.total === 0) {
        console.log('⚠️  Nenhum database encontrado!');
        console.log('   Você precisa criar um database no console Appwrite primeiro');
        console.log('   https://cloud.appwrite.io/console/project-69ea271e000d28e3afce');
        return;
      }

      console.log(`📊 ${json.total} database(s) encontrado(s):\n`);
      for (const db of json.databases) {
        console.log(`✅ ${db.$id}`);
        console.log(`   Name: ${db.name}`);
        console.log(`   Created: ${db.$createdAt}`);
        console.log('');
      }

      // Usar o primeiro database
      if (json.databases.length > 0) {
        const dbId = json.databases[0].$id;
        console.log(`\n📝 Use este DATABASE_ID:\n`);
        console.log(`   VITE_APPWRITE_DATABASE=${dbId}`);
        console.log(`   ou em .env.local`);
      }
    } catch (e) {
      console.log('Body:', data.substring(0, 500));
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Erro:', error.message);
});

req.end();
