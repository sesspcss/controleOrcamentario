'use strict';
const https = require('https');

const PROJECT_ID = '69ea271e000d28e3afce';
const API_KEY = 'standard_8834bd8610e14b14457c14af3d1ebaa4de0a89405faeb1186a02d517d251b31c125896555137773df5d8fc00f87bb0f67b032cdb5f2dea1b6d4841b9b0d46e8022df8202ccd30b5b9046bf190eb9f5c0e26501ffbc89527f94e8c95eb14c627af38568f0647b64973868741b16b8e2d0ac257b8b1a838600c24a7d6120edf204';

function post(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const opts = {
      hostname: 'fra.cloud.appwrite.io',
      port: 443,
      path,
      method: 'POST',
      rejectUnauthorized: false,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'X-Appwrite-Project': PROJECT_ID,
        'X-Appwrite-Key': API_KEY,
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('Adicionando plataformas web no Appwrite...\n');

  const platforms = [
    { name: 'Cloudflare Pages', hostname: 'controleorcamentario.pages.dev' },
    { name: 'Localhost Dev', hostname: 'localhost' },
  ];

  for (const p of platforms) {
    const platformId = p.hostname.replace(/\./g, '-').replace(/[^a-zA-Z0-9-]/g, '');
    const res = await post(`/v1/projects/${PROJECT_ID}/platforms`, {
      platformId,
      type: 'web',
      name: p.name,
      hostname: p.hostname,
    });

    const json = JSON.parse(res.body);

    if (res.status === 201) {
      console.log(`✅ ${p.hostname} adicionado (ID: ${json.$id})`);
    } else if (res.status === 409 || json.message?.includes('already exists')) {
      console.log(`ℹ️  ${p.hostname} já existe`);
    } else {
      console.log(`⚠️  ${p.hostname}: ${res.status} — ${json.message}`);
    }
  }

  console.log('\n✅ CORS configurado para controleorcamentario.pages.dev');
}

main().catch(console.error);
