const https = require('https');

const ENDPOINT = 'fra.cloud.appwrite.io';
const PROJECT_ID = '69ea271e000d28e3afce';
const API_KEY = 'standard_8834bd8610e14b14457c14af3d1ebaa4de0a89405faeb1186a02d517d251b31c125896555137773df5d8fc00f87bb0f67b032cdb5f2dea1b6d4841b9b0d46e8022df8202ccd30b5b9046bf190eb9f5c0e26501ffbc89527f94e8c95eb14c627af38568f0647b64973868741b16b8e2d0ac257b8b1a838600c24a7d6120edf204';

console.log('Criando database...\n');

const body = JSON.stringify({
  databaseId: 'default',
  name: 'Controle Orcamento',
});

const options = {
  hostname: ENDPOINT,
  port: 443,
  path: '/v1/databases',
  method: 'POST',
  rejectUnauthorized: false,
  headers: {
    'X-Appwrite-Project': PROJECT_ID,
    'X-Appwrite-Key': API_KEY,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
};

const req = https.request(options, (res) => {
  let data = '';

  console.log('Status:', res.statusCode);
  console.log('Headers:', res.headers);

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('\nResponse:', data.substring(0, 300));

    if (res.statusCode === 201) {
      const json = JSON.parse(data);
      console.log('\n✅ Database criado:', json.$id);
    } else if (res.statusCode === 409) {
      console.log('\n⚠️  Database já existe');
    } else {
      console.log('\n❌ Erro');
    }
  });
});

req.on('error', (error) => {
  console.error('Error:', error.message);
});

console.log('Body:', body);
req.write(body);
req.end();
