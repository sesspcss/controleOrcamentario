/**
 * Verificação Simples do Appwrite
 * Usa HTTP request direto
 */

const ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID = '69ea271e000d28e3afce';
const API_KEY = process.env.APPWRITE_API_KEY || 'standard_8834bd8610e14b14457c14af3d1ebaa4de0a89405faeb1186a02d517d251b31c125896555137773df5d8fc00f87bb0f67b032cdb5f2dea1b6d4841b9b0d46e8022df8202ccd30b5b9046bf190eb9f5c0e26501ffbc89527f94e8c95eb14c627af38568f0647b64973868741b16b8e2d0ac257b8b1a838600c24a7d6120edf204';
const DATABASE_ID = 'database-69ea274b00316d3d1dfb';

async function main() {
  try {
    console.log('🚀 Verificando Appwrite...\n');

    // Testar conexão
    const response = await fetch(
      `${ENDPOINT}/databases/${DATABASE_ID}`,
      {
        headers: {
          'X-Appwrite-Project': PROJECT_ID,
          'X-Appwrite-Key': API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error('❌ Erro na conexão:', response.status, response.statusText);
      console.error(await response.text());
      process.exit(1);
    }

    const db = await response.json() as any;
    console.log('✅ Conexão com Appwrite: OK');
    console.log(`📦 Database: ${db.$id}`);
    console.log(`📝 Nome: ${db.name}\n`);

    // Listar collections
    const colResponse = await fetch(
      `${ENDPOINT}/databases/${DATABASE_ID}/collections`,
      {
        headers: {
          'X-Appwrite-Project': PROJECT_ID,
          'X-Appwrite-Key': API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    const cols = await colResponse.json() as any;
    console.log(`📊 Collections encontradas: ${cols.total}\n`);
    
    if (cols.collections && cols.collections.length > 0) {
      for (const col of cols.collections) {
        console.log(`  ✅ ${col.$id}`);
      }
    } else {
      console.log('  (nenhuma collection encontrada - criar via console Appwrite)');
    }

    console.log('\n✅ Appwrite configurado!\n');
    console.log('Próximos passos:');
    console.log('1. Criar collections no console Appwrite (se não existirem)');
    console.log('2. Deploy das 3 Appwrite Functions');
    console.log('3. npm run migrate-supabase-to-appwrite');

  } catch (error: any) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

main();
