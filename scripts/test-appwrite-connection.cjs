#!/usr/bin/env node

const https = require('https');

const options = {
  hostname: 'fra.cloud.appwrite.io',
  port: 443,
  path: '/v1/databases/database-69ea274b00316d3d1dfb',
  method: 'GET',
  headers: {
    'X-Appwrite-Project': '69ea271e000d28e3afce',
    'X-Appwrite-Key': 'standard_8834bd8610e14b14457c14af3d1ebaa4de0a89405faeb1186a02d517d251b31c125896555137773df5d8fc00f87bb0f67b032cdb5f2dea1b6d4841b9b0d46e8022df8202ccd30b5b9046bf190eb9f5c0e26501ffbc89527f94e8c95eb14c627af38568f0647b64973868741b16b8e2d0ac257b8b1a838600c24a7d6120edf204',
    'Content-Type': 'application/json',
  },
};

const req = https.request(options, (res) => {
  console.log('✅ Conexão OK! Status:', res.statusCode);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    if (res.statusCode === 200) {
      const json = JSON.parse(data);
      console.log('\n📦 Database encontrada:');
      console.log('  ID:', json.$id);
      console.log('  Nome:', json.name);
      console.log('\n✅ Appwrite funcionando!');
    } else {
      console.error('❌ Erro:', res.statusCode);
      console.error(data);
    }
  });
});

req.on('error', (e) => {
  console.error('❌ Erro de conexão:', e.message);
  process.exit(1);
});

console.log('🔍 Testando conexão com Appwrite...');
req.end();
