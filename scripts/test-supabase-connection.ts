import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODkwNDQsImV4cCI6MjA5MTM2NTA0NH0.t3tWIh3F9lmg-a6zzdmoKpupHB9i7hTfvFmPyFbZNZs';

console.log('Testando conexão com Supabase...\n');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

(async () => {
  try {
    console.log('Lendo uma linha de lc131_despesas...\n');

    const { data, error } = await supabase
      .from('lc131_despesas')
      .select('*')
      .limit(1);

    if (error) {
      console.error('❌ Erro:', error.message);
      process.exit(1);
    }

    if (data && data.length > 0) {
      console.log('✅ Conexão OK!');
      console.log(`   Primeiro registro:`);
      console.log(`   ID: ${data[0].id}`);
      console.log(`   Ano: ${data[0].ano_referencia}`);
      console.log(`   Municipio: ${data[0].municipio}`);
    } else {
      console.log('✅ Conexão OK! (mas nenhum registro encontrado)');
    }
  } catch (error) {
    console.error('❌ Erro de conexão:', error.message);
    process.exit(1);
  }
})();
