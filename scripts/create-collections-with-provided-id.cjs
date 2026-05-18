const https = require('https');

const ENDPOINT = 'fra.cloud.appwrite.io';
const PROJECT_ID = '69ea271e000d28e3afce';
const DATABASE_ID = 'database-69ea274b00316d3d1dfb'; // ID que você forneceu
const API_KEY = 'standard_8834bd8610e14b14457c14af3d1ebaa4de0a89405faeb1186a02d517d251b31c125896555137773df5d8fc00f87bb0f67b032cdb5f2dea1b6d4841b9b0d46e8022df8202ccd30b5b9046bf190eb9f5c0e26501ffbc89527f94e8c95eb14c627af38568f0647b64973868741b16b8e2d0ac257b8b1a838600c24a7d6120edf204';

console.log(`Usando database ID fornecido: ${DATABASE_ID}\n`);

const collections = [
  { id: 'lc131_despesas', name: 'Lei 131 - Despesas' },
  { id: 'bd_ref', name: 'Banco Referência' },
  { id: 'tab_drs', name: 'Tabela DRS' },
  { id: 'tab_rras', name: 'Tabela RRAS' },
];

console.log('Criando collections...\n');

let done = 0;

for (let i = 0; i < collections.length; i++) {
  const coll = collections[i];

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
      path: `/v1/databases/${DATABASE_ID}/collections`,
      method: 'POST',
      rejectUnauthorized: false,
      headers: {
        'X-Appwrite-Project': PROJECT_ID,
        'X-Appwrite-Key': API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        done++;

        if (res.statusCode === 201) {
          console.log(`✅ ${coll.id}`);
        } else if (res.statusCode === 409) {
          console.log(`ℹ️  ${coll.id} (já existe)`);
        } else if (res.statusCode === 404) {
          console.log(`⚠️  ${coll.id} (database not found)`);
        } else {
          console.log(`❌ ${coll.id} (${res.statusCode})`);
          try {
            const json = JSON.parse(data);
            console.log(`   ${json.message}`);
          } catch (e) {
            console.log(`   ${data.substring(0, 100)}`);
          }
        }

        if (done === collections.length) {
          console.log('\n✅ Feito!');
        }
      });
    });

    req.on('error', (e) => {
      console.error(`❌ ${coll.id}: ${e.message}`);
      done++;
    });

    req.write(body);
    req.end();
  }, i * 500);
}
