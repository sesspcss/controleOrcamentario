/**
 * Setup Simples: Valida Appwrite
 * 
 * Uso: tsx scripts/setup-appwrite.ts
 */

import { Client, Databases } from 'appwrite';

const client = new Client();
client.setEndpoint('https://fra.cloud.appwrite.io/v1');
client.setProject('69ea271e000d28e3afce');
client.setApiKey(process.env.APPWRITE_API_KEY || 'standard_8834bd8610e14b14457c14af3d1ebaa4de0a89405faeb1186a02d517d251b31c125896555137773df5d8fc00f87bb0f67b032cdb5f2dea1b6d4841b9b0d46e8022df8202ccd30b5b9046bf190eb9f5c0e26501ffbc89527f94e8c95eb14c627af38568f0647b64973868741b16b8e2d0ac257b8b1a838600c24a7d6120edf204');

const databases = new Databases(client);

async function main() {
  try {
    console.log('🚀 Testando conexão com Appwrite...\n');

    // Testar conexão
    const db = await databases.get('database-69ea274b00316d3d1dfb');
    console.log('✅ Conexão com Appwrite: OK');
    console.log(`📦 Database: ${db.$id}`);
    console.log(`📝 Nome: ${db.name}\n`);

    // Listar collections
    const collections = await databases.listCollections('database-69ea274b00316d3d1dfb');
    console.log(`📊 Collections encontradas: ${collections.total}\n`);
    
    for (const col of collections.collections) {
      console.log(`  ✅ ${col.$id} (${col.documentsCount} documentos)`);
    }

    console.log('\n✅ Setup pronto para migração de dados!');
    console.log('\nPróximos passos:');
    console.log('1. Fazer deploy das 3 Appwrite Functions (via console)');
    console.log('2. npm run migrate-supabase-to-appwrite');
    console.log('3. Aguardar conclusão (~1-6 horas)');

  } catch (error: any) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

main();
