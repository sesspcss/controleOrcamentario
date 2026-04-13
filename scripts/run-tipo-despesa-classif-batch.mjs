import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODkwNDQsImV4cCI6MjA5MTM2NTA0NH0.t3tWIh3F9lmg-a6zzdmoKpupHB9i7hTfvFmPyFbZNZs';
const BATCH_SIZE = 5000;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  let total = 0;
  let iteration = 0;

  for (;;) {
    iteration += 1;
    const startedAt = Date.now();

    const { data, error } = await supabase.rpc('refresh_tipo_despesa_classif_batch', {
      p_batch_size: BATCH_SIZE,
    });

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

    if (error) {
      console.error(`Batch ${iteration} ERRO (${elapsed}s): ${error.message}`);
      process.exit(1);
    }

    const updated = typeof data === 'number' ? data : Number(data || 0);
    total += updated;

    console.log(`Batch ${iteration}: ${updated} atualizados (${elapsed}s) | Total: ${total}`);

    if (updated === 0) {
      console.log(`Concluido. Total atualizado: ${total}`);
      break;
    }
  }
}

main().catch((error) => {
  console.error('Erro fatal:', error);
  process.exit(1);
});
