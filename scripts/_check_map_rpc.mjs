import { createClient } from '@supabase/supabase-js';
const sb = createClient(
  'https://teikzwrfsxjipxozzhbr.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4OTA0NCwiZXhwIjoyMDkxMzY1MDQ0fQ.t3tWIh3F9lmg-a6zzdmoKpupHB9i7hTfvFmPyFbZNZs'
);
const { data, error } = await sb.rpc('lc131_map_data', { p_ano: 2026 });
if (error) { console.error('RPC ERROR:', error.message); process.exit(1); }
const k = data?.kpis;
console.log('kpis keys:', Object.keys(k ?? {}));
console.log('pago:', k?.pago);
console.log('pago_total:', k?.pago_total);
