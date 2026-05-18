import { Client, Databases } from 'appwrite';

const client = new Client();

client
  .setEndpoint('https://fra.cloud.appwrite.io/v1')
  .setProject('69ea271e000d28e3afce');

// IMPORTANTE: Usar .setApiKey() em vez de .setKey() para v13
if (typeof (client as any).setApiKey === 'function') {
  (client as any).setApiKey('standard_8834bd8610e14b14457c14af3d1ebaa4de0a89405faeb1186a02d517d251b31c125896555137773df5d8fc00f87bb0f67b032cdb5f2dea1b6d4841b9b0d46e8022df8202ccd30b5b9046bf190eb9f5c0e26501ffbc89527f94e8c95eb14c627af38568f0647b64973868741b16b8e2d0ac257b8b1a838600c24a7d6120edf204');
} else if (typeof (client as any).setKey === 'function') {
  (client as any).setKey('standard_8834bd8610e14b14457c14af3d1ebaa4de0a89405faeb1186a02d517d251b31c125896555137773df5d8fc00f87bb0f67b032cdb5f2dea1b6d4841b9b0d46e8022df8202ccd30b5b9046bf190eb9f5c0e26501ffbc89527f94e8c95eb14c627af38568f0647b64973868741b16b8e2d0ac257b8b1a838600c24a7d6120edf204');
}

const databases = new Databases(client);
const databaseId = 'database-69ea274b00316d3d1dfb';

const collections = [
  { id: 'lc131_despesas', name: 'Lei de Comunicações 131 - Despesas' },
  { id: 'bd_ref', name: 'Banco de Referência' },
  { id: 'tab_drs', name: 'Tabela DRS' },
  { id: 'tab_rras', name: 'Tabela RRAS' },
];

async function createCollections() {
  console.log('🚀 Criando collections...\n');

  for (const coll of collections) {
    try {
      console.log(`  Criando ${coll.id}...`);
      
      const result = await (databases.createCollection as any)(
        databaseId,
        coll.id,
        coll.name,
        undefined,
        [
          'read("any")',
          'create("any")',
          'update("any")',
          'delete("any")',
        ]
      );

      console.log(`  ✅ ${coll.id} criada!`);
    } catch (error: any) {
      if (error.message?.includes('already exists') || error.code === 409) {
        console.log(`  ℹ️  ${coll.id} já existe`);
      } else {
        console.error(`  ❌ Erro:`, error.message || error);
      }
    }
  }

  console.log('\n✅ Collections prontas!');
}

createCollections().catch((error) => {
  console.error('❌ Erro geral:', error);
  process.exit(1);
});
