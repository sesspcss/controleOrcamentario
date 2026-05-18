/**
 * Cria as 4 collections necessárias no Appwrite
 * Usa HTTP requests direto (evita problemas de SDK)
 */

const ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID = '69ea271e000d28e3afce';
const DATABASE_ID = 'database-69ea274b00316d3d1dfb';
const API_KEY = process.env.APPWRITE_API_KEY || 'standard_8834bd8610e14b14457c14af3d1ebaa4de0a89405faeb1186a02d517d251b31c125896555137773df5d8fc00f87bb0f67b032cdb5f2dea1b6d4841b9b0d46e8022df8202ccd30b5b9046bf190eb9f5c0e26501ffbc89527f94e8c95eb14c627af38568f0647b64973868741b16b8e2d0ac257b8b1a838600c24a7d6120edf204';

const headers = {
  'X-Appwrite-Project': PROJECT_ID,
  'X-Appwrite-Key': API_KEY,
  'Content-Type': 'application/json',
};

interface CollectionDef {
  id: string;
  name: string;
}

const collections: CollectionDef[] = [
  { id: 'lc131_despesas', name: 'Lei de Comunicações 131 - Despesas' },
  { id: 'bd_ref', name: 'Banco de Referência' },
  { id: 'tab_drs', name: 'Tabela DRS' },
  { id: 'tab_rras', name: 'Tabela RRAS' },
];

async function createCollection(collDef: CollectionDef) {
  try {
    console.log(`  Criando ${collDef.id}...`);

    const response = await fetch(
      `${ENDPOINT}/databases/${DATABASE_ID}/collections`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          collectionId: collDef.id,
          name: collDef.name,
          permissions: [
            'read("any")',
            'create("any")',
            'update("any")',
            'delete("any")',
          ],
        }),
      }
    );

    if (response.status === 409) {
      console.log(`  ℹ️  ${collDef.id} já existe`);
      return true;
    }

    if (!response.ok) {
      const error = await response.text();
      console.error(`  ❌ Erro ao criar ${collDef.id}:`, response.status, error);
      return false;
    }

    console.log(`  ✅ ${collDef.id} criada!`);
    return true;
  } catch (error: any) {
    console.error(`  ❌ Erro ao criar ${collDef.id}:`, error.message);
    return false;
  }
}

async function main() {
  try {
    console.log('\n🚀 Criando Collections no Appwrite...\n');

    let successCount = 0;
    for (const coll of collections) {
      const ok = await createCollection(coll);
      if (ok) successCount++;
      await new Promise((r) => setTimeout(r, 500)); // Pequena pausa entre requests
    }

    console.log(`\n✅ ${successCount}/${collections.length} collections criadas!`);
    console.log('\n📋 Próximas etapas:');
    console.log('  1. Deploy das 3 Appwrite Functions');
    console.log('  2. npm run migrate-supabase-to-appwrite');
    console.log('  3. npm run dev');

  } catch (error: any) {
    console.error('\n❌ Erro geral:', error.message);
    process.exit(1);
  }
}

main();
