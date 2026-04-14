import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx') as typeof import('xlsx');

const SUPABASE_URL = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODkwNDQsImV4cCI6MjA5MTM2NTA0NH0.t3tWIh3F9lmg-a6zzdmoKpupHB9i7hTfvFmPyFbZNZs';
const TARGET_TABLE = 'tipo_despesa_ref';
const SHEET_NAME = 'BASE DE DADOS';
const DEFAULT_FILE = 'C:/Users/afpereira/Downloads/TIPO_DESPESA.xlsx';
const CHUNK_SIZE = 500;

type Bucket = {
  sample: string;
  counts: Map<string, number>;
  total: number;
};

function normalizeText(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalizeTipo(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  const normalized = normalizeText(raw);

  switch (normalized) {
    case 'EMENDAS':
      return 'EMENDA';
    case 'GESTAO ESTADUAL':
      return 'GESTÃO ESTADUAL';
    case 'TABELASUS PAULISTA':
      return 'TABELA SUS PAULISTA';
    case 'PISO DA ENFERMAGEM':
      return 'PISO ENFERMAGEM';
    case 'RLM FERNANDOPOLIS':
      return 'RLM FERNANDÓPOLIS';
    case 'RLM PARIQUERA ACU':
      return 'RLM PARIQUERA ACÚ';
    default:
      return raw;
  }
}

// Generic/umbrella types that specific program types should override
const GENERIC_TYPES = new Set(['UNIDADE PRÓPRIA', 'TRANFERÊNCIA VOLUNTÁRIA']);

async function confirm(prompt: string): Promise<boolean> {
  process.stdout.write(prompt);
  const answer = await new Promise<string>((resolve) => {
    process.stdin.resume();
    process.stdin.once('data', (data) => {
      process.stdin.pause();
      resolve(data.toString().trim());
    });
  });

  return /^s(im)?$/i.test(answer);
}

async function main() {
  const filePath = process.argv[2] || DEFAULT_FILE;
  if (!fs.existsSync(filePath)) {
    console.error(`Arquivo não encontrado: ${filePath}`);
    process.exit(1);
  }

  const workbook = XLSX.readFile(filePath);
  const worksheet = workbook.Sheets[SHEET_NAME];
  if (!worksheet) {
    console.error(`Aba não encontrada: ${SHEET_NAME}`);
    console.error(`Abas disponíveis: ${workbook.SheetNames.join(', ')}`);
    process.exit(1);
  }

  const rows: string[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  const header = rows[0]?.map((cell) => String(cell || '').trim()) || [];
  const tipoIndex = header.findIndex((cell) => normalizeText(cell) === 'TIPO DE DESPESA');
  const descIndex = header.findIndex((cell) => normalizeText(cell) === 'DESCRICAO PROCESSO');

  if (tipoIndex < 0 || descIndex < 0) {
    console.error('Colunas esperadas não encontradas. Esperado: "TIPO DE DESPESA" e "Descrição Processo".');
    process.exit(1);
  }

  const buckets = new Map<string, Bucket>();
  for (let i = 1; i < rows.length; i++) {
    const rawTipo = String(rows[i][tipoIndex] || '').trim();
    const rawDesc = String(rows[i][descIndex] || '').trim();
    if (!rawTipo || !rawDesc) continue;

    const tipo = canonicalizeTipo(rawTipo);
    const descNorm = normalizeText(rawDesc);
    if (!tipo || !descNorm) continue;

    let bucket = buckets.get(descNorm);
    if (!bucket) {
      bucket = { sample: rawDesc, counts: new Map<string, number>(), total: 0 };
      buckets.set(descNorm, bucket);
    }

    bucket.total += 1;
    bucket.counts.set(tipo, (bucket.counts.get(tipo) || 0) + 1);
  }

  const mappings = [] as Array<{
    descricao_processo_norm: string;
    descricao_processo_exemplo: string;
    tipo_despesa: string;
    ocorrencias: number;
    atualizado_em: string;
  }>;
  const ambiguous = [] as Array<{
    descricao_processo_exemplo: string;
    descricao_processo_norm: string;
    tipos: Array<{ tipo: string; ocorrencias: number }>;
  }>;
  const nowIso = new Date().toISOString();

  for (const [descNorm, bucket] of buckets.entries()) {
    const tipos = [...bucket.counts.entries()]
      .map(([tipo, ocorrencias]) => ({ tipo, ocorrencias }))
      .sort((left, right) => right.ocorrencias - left.ocorrencias || left.tipo.localeCompare(right.tipo));

    // Prefer specific program types over generic umbrella types (UNIDADE PRÓPRIA / TRANFERÊNCIA VOLUNTÁRIA)
    const specificTipos = tipos.filter(({ tipo }) => !GENERIC_TYPES.has(tipo));
    const winner = specificTipos.length > 0 ? specificTipos[0] : tipos[0];

    mappings.push({
      descricao_processo_norm: descNorm,
      descricao_processo_exemplo: bucket.sample,
      tipo_despesa: winner.tipo,
      ocorrencias: winner.ocorrencias,
      atualizado_em: nowIso,
    });

    if (tipos.length > 1) {
      ambiguous.push({
        descricao_processo_exemplo: bucket.sample,
        descricao_processo_norm: descNorm,
        tipos,
      });
    }
  }

  console.log(`Arquivo: ${path.basename(filePath)}`);
  console.log(`Descrições normalizadas: ${buckets.size}`);
  console.log(`Mapeamentos de lookup: ${mappings.length}`);
  console.log(`Descrições ambíguas resolvidas por maior ocorrência: ${ambiguous.length}`);

  if (ambiguous.length > 0) {
    console.log('\nAmostra de descrições ambíguas resolvidas por maior ocorrência:');
    for (const item of ambiguous.slice(0, 15)) {
      const tipos = item.tipos
        .slice(0, 4)
        .map((entry) => `${entry.tipo} (${entry.ocorrencias})`)
        .join(', ');
      console.log(`- ${item.descricao_processo_exemplo}: ${tipos}`);
    }
  }

  const shouldContinue = await confirm(`\nFazer UPSERT de ${mappings.length} registros em ${TARGET_TABLE}? (s/N) `);
  if (!shouldContinue) {
    console.log('Cancelado.');
    process.exit(0);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  let uploaded = 0;

  for (let i = 0; i < mappings.length; i += CHUNK_SIZE) {
    const chunk = mappings.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase
      .from(TARGET_TABLE)
      .upsert(chunk, { onConflict: 'descricao_processo_norm', ignoreDuplicates: false });

    if (error) {
      console.error(`Falha no chunk ${i}-${i + chunk.length}: ${error.message}`);
      process.exit(1);
    }

    uploaded += chunk.length;
    console.log(`Enviado ${uploaded}/${mappings.length}`);
  }

  console.log('\nImportação concluída.');
  console.log(`Tabela atualizada: ${TARGET_TABLE}`);
  console.log(`Mapeamentos carregados: ${mappings.length}`);
  console.log(`Descrições ambíguas resolvidas por maior ocorrência: ${ambiguous.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});