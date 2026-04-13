/**
 * import-tipo-despesa-rpc.mjs
 * ─────────────────────────────────────────────────────────────────
 * Importa TIPO_DESPESA.xlsx para tipo_despesa_ref via RPC
 * (evita bloqueio de proxy na rota /rest/v1/tipo_despesa_ref)
 *
 * PRÉ-REQUISITO no SQL Editor do Supabase (uma vez):
 *   1. recreate-tipo-despesa-ref.sql
 *   2. create-tipo-despesa-upsert-fn.sql
 *
 * USO:
 *   $env:NODE_TLS_REJECT_UNAUTHORIZED="0"
 *   node scripts/import-tipo-despesa-rpc.mjs "C:\Users\afpereira\Downloads\TIPO_DESPESA.xlsx"
 * ─────────────────────────────────────────────────────────────────
 */

import { createRequire } from 'module';
import * as fs from 'fs';
import * as path from 'path';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const SUPABASE_URL = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODkwNDQsImV4cCI6MjA5MTM2NTA0NH0.t3tWIh3F9lmg-a6zzdmoKpupHB9i7hTfvFmPyFbZNZs';
const SHEET_NAME   = 'BASE DE DADOS';
const CHUNK_SIZE   = 200;

const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: 'Bearer ' + SUPABASE_KEY,
  'Content-Type': 'application/json',
};

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalizeTipo(value) {
  const raw = String(value || '').trim();
  const normalized = normalizeText(raw);
  switch (normalized) {
    case 'EMENDAS':          return 'EMENDA';
    case 'GESTAO ESTADUAL':  return 'GESTÃO ESTADUAL';
    case 'TABELASUS PAULISTA': return 'TABELA SUS PAULISTA';
    case 'PISO DA ENFERMAGEM': return 'PISO ENFERMAGEM';
    case 'RLM FERNANDOPOLIS': return 'RLM FERNANDÓPOLIS';
    case 'RLM PARIQUERA ACU': return 'RLM PARIQUERA ACÚ';
    default: return raw;
  }
}

async function callRpc(name, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.substring(0, 500)}`);
  return JSON.parse(text);
}

async function main() {
  const filePath = process.argv[2] || 'C:/Users/afpereira/Downloads/TIPO_DESPESA.xlsx';
  if (!fs.existsSync(filePath)) {
    console.error(`Arquivo não encontrado: ${filePath}`);
    process.exit(1);
  }

  console.log(`Lendo: ${path.basename(filePath)}`);
  const workbook = XLSX.readFile(filePath);
  const worksheet = workbook.Sheets[SHEET_NAME];
  if (!worksheet) {
    console.error(`Aba não encontrada: ${SHEET_NAME}`);
    console.error(`Abas disponíveis: ${workbook.SheetNames.join(', ')}`);
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  const header = rows[0]?.map(cell => String(cell || '').trim()) || [];
  const tipoIndex = header.findIndex(cell => normalizeText(cell) === 'TIPO DE DESPESA');
  const descIndex = header.findIndex(cell => normalizeText(cell) === 'DESCRICAO PROCESSO');

  if (tipoIndex < 0 || descIndex < 0) {
    console.error('Colunas esperadas não encontradas: "TIPO DE DESPESA" e "Descrição Processo"');
    console.error('Colunas encontradas:', header.join(', '));
    process.exit(1);
  }

  // Build exact mappings (like original import-tipo-despesa.ts)
  const buckets = new Map();
  for (let i = 1; i < rows.length; i++) {
    const rawTipo = String(rows[i][tipoIndex] || '').trim();
    const rawDesc = String(rows[i][descIndex] || '').trim();
    if (!rawTipo || !rawDesc) continue;
    const tipo = canonicalizeTipo(rawTipo);
    const descNorm = normalizeText(rawDesc);
    if (!tipo || !descNorm) continue;
    let bucket = buckets.get(descNorm);
    if (!bucket) { bucket = { sample: rawDesc, counts: new Map(), total: 0 }; buckets.set(descNorm, bucket); }
    bucket.total += 1;
    bucket.counts.set(tipo, (bucket.counts.get(tipo) || 0) + 1);
  }

  const nowIso = new Date().toISOString();
  const exactMappings = [];
  for (const [descNorm, bucket] of buckets.entries()) {
    const tipos = [...bucket.counts.entries()]
      .map(([tipo, ocorrencias]) => ({ tipo, ocorrencias }))
      .sort((a, b) => b.ocorrencias - a.ocorrencias);
    if (tipos.length === 1) {
      exactMappings.push({
        descricao_processo_norm: descNorm,
        descricao_processo_exemplo: bucket.sample,
        tipo_despesa: tipos[0].tipo,
        ocorrencias: tipos[0].ocorrencias,
        atualizado_em: nowIso,
      });
    }
  }

  console.log(`Mapeamentos exatos: ${exactMappings.length}`);
  console.log(`Enviando em chunks de ${CHUNK_SIZE} via RPC...`);

  let uploaded = 0;
  for (let i = 0; i < exactMappings.length; i += CHUNK_SIZE) {
    const chunk = exactMappings.slice(i, i + CHUNK_SIZE);
    const count = await callRpc('upsert_tipo_despesa_ref', { p_rows: chunk });
    uploaded += chunk.length;
    process.stdout.write(`\r  Enviado ${uploaded}/${exactMappings.length} (último chunk: ${count})`);
  }

  console.log(`\n\n✅ Import concluído! ${uploaded} mapeamentos inseridos em tipo_despesa_ref`);
  console.log('\nPróximo passo: execute enrich-tipo-despesa-from-ref.sql no Supabase SQL Editor');
}

main().catch(e => { console.error('\n❌ Erro:', e.message); process.exit(1); });
