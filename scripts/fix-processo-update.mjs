/**
 * fix-processo.mjs  –  Atualiza descricao_processo e numero_processo
 * lendo os valores do Excel e fazendo match por fingerprint.
 *
 * Fluxo por ano:
 *  1. Lê Excel → mapa(fingerprint → {descricao_processo, numero_processo})
 *  2. Busca todas as linhas do DB (id + cols-chave) onde descricao_processo IS NULL
 *  3. Computa fingerprint de cada linha DB → obtém id
 *  4. Agrupa IDs por (desc, num) e faz PATCH em lote
 */
import { createHash } from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const SUPA_URL = 'https://odnstbeuiojohutoqvvw.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kbnN0YmV1aW9qb2h1dG9xdnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MTQ1NzgsImV4cCI6MjA5MDA5MDU3OH0._71Nt-rjs3EvOuDcGcQcPFKug-iDg_dEs38UVLBLJEQ';
const hdrs = {
  apikey: SUPA_KEY,
  Authorization: `Bearer ${SUPA_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
};

// ── Colunas para fingerprint (matching Excel↔DB) ────────────
const FP_COLS = [
  'codigo_ug', 'codigo_projeto_atividade', 'codigo_elemento',
  'codigo_favorecido', 'empenhado', 'liquidado', 'pago', 'pago_anos_anteriores',
];

function fp(row) {
  return createHash('md5')
    .update(FP_COLS.map(c => String(row[c] ?? '')).join('\x00'))
    .digest('hex');
}

function normalizeColName(raw) {
  return String(raw).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '').replace(/__+/g, '_') || 'col_vazia';
}

function isNumericCol(vals) {
  const ne = vals.filter(v => v !== '' && v != null);
  if (!ne.length) return false;
  return ne.every(v => !isNaN(Number(String(v).replace(',', '.'))));
}

// ── Lê Excel e retorna mapa fingerprint → processo ──────────
function readExcelProcesso(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Detecta header
  let hIdx = 0;
  for (let i = 0; i < Math.min(10, raw.length); i++) {
    const row = raw[i];
    const ne = row.filter(v => v !== '' && v != null);
    const txt = ne.filter(v => typeof v === 'string' && isNaN(Number(v)));
    if (ne.length >= 3 && txt.length / ne.length > 0.6) { hIdx = i; break; }
  }
  const headers = raw[hIdx].map(normalizeColName);
  const dataStart = hIdx + 1;

  // Detecta colunas numéricas
  const numCols = new Set(headers.filter(h => {
    const idx = headers.indexOf(h);
    return isNumericCol(raw.slice(dataStart, dataStart + 50).map(r => r[idx]));
  }));

  const SKIP = ['total geral', 'total', 'subtotal'];
  const map = new Map(); // fingerprint → { descricao_processo, numero_processo }
  let total = 0;

  for (let i = dataStart; i < raw.length; i++) {
    const r = raw[i];
    if (r.every(v => v === '' || v == null)) continue;
    const first = String(r[0] ?? '').toLowerCase().trim();
    if (SKIP.some(p => first.startsWith(p))) continue;

    const row = {};
    headers.forEach((col, j) => {
      const v = r[j] ?? '';
      if (numCols.has(col)) {
        row[col] = v === '' || v == null ? null : (isNaN(Number(String(v).replace(',', '.'))) ? null : Number(String(v).replace(',', '.')));
      } else {
        row[col] = v === '' ? null : v;
      }
    });

    const desc = row.descricao_processo;
    const num = row.numero_processo;
    if (!desc && !num) continue;

    const key = fp(row);
    map.set(key, {
      descricao_processo: desc ? String(desc) : null,
      numero_processo: num ? String(num) : null,
    });
    total++;
  }
  return { map, total };
}

// ── Fetch DB rows por ano (ALL rows, sem filtro NULL) ────────
async function fetchDbRows(year) {
  const sel = ['id', 'descricao_processo', ...FP_COLS].join(',');
  const rows = [];
  const PAGE = 500;
  let lastId = 0;
  let retries = 0;

  while (true) {
    const url = `${SUPA_URL}/rest/v1/lc131_despesas?select=${sel}&ano_referencia=eq.${year}&id=gt.${lastId}&order=id&limit=${PAGE}`;
    const r = await fetch(url, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } });
    if (!r.ok) {
      const txt = await r.text();
      if (r.status === 500 && txt.includes('timeout') && retries < 3) {
        retries++;
        await new Promise(ok => setTimeout(ok, 3000));
        continue;
      }
      throw new Error(`Fetch DB ${year} id>${lastId}: ${r.status} ${txt.substring(0, 200)}`);
    }
    retries = 0;
    const data = await r.json();
    if (!data.length) break;
    // Só adiciona linhas sem descricao_processo
    for (const row of data) {
      if (!row.descricao_processo) rows.push(row);
    }
    lastId = data[data.length - 1].id;
    process.stdout.write(`\r   DB ${year}: lidos até id=${lastId}, ${rows.length.toLocaleString('pt-BR')} sem processo...`);
    if (data.length < PAGE) break;
  }
  process.stdout.write(`\r   DB ${year}: ${rows.length.toLocaleString('pt-BR')} linhas sem processo                              \n`);
  return rows;
}

// ── PATCH em lote por grupo de IDs ───────────────────────────
async function patchBatch(ids, values) {
  // PostgREST: PATCH com filtro id=in.(...)
  const BATCH = 200; // IDs por request
  let done = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const filter = `id=in.(${chunk.join(',')})`;
    const url = `${SUPA_URL}/rest/v1/lc131_despesas?${filter}`;
    const r = await fetch(url, {
      method: 'PATCH',
      headers: hdrs,
      body: JSON.stringify(values),
    });
    if (!r.ok) {
      const txt = await r.text();
      console.error(`\n   PATCH ERR ${r.status}: ${txt.substring(0, 200)}`);
      return done;
    }
    done += chunk.length;
  }
  return done;
}

// ── Main ─────────────────────────────────────────────────────
const YEARS = [
  { year: 2022, file: 'C:\\Users\\afpereira\\Downloads\\LC31\\LC_131_2022.xlsx' },
  { year: 2023, file: 'C:\\Users\\afpereira\\Downloads\\LC31\\LC_131_2023.xlsx' },
  { year: 2024, file: 'C:\\Users\\afpereira\\Downloads\\LC31\\LC_131_2024.xlsx' },
  { year: 2025, file: 'C:\\Users\\afpereira\\Downloads\\LC31\\LC_131_2025.xlsx' },
  { year: 2026, file: 'C:\\Users\\afpereira\\Downloads\\LC31\\LC_131_2026.xlsx' },
];

async function main() {
  console.log('══════════════════════════════════════════════════════');
  console.log('  FIX descricao_processo + numero_processo');
  console.log('══════════════════════════════════════════════════════\n');

  let totalUpdated = 0;

  for (const { year, file } of YEARS) {
    console.log(`\n── ${year} ──────────────────────────────────────`);

    // 1. Lê Excel
    process.stdout.write(`   Lendo Excel...`);
    let excelMap;
    try {
      const result = readExcelProcesso(file);
      excelMap = result.map;
      process.stdout.write(` ${result.total.toLocaleString('pt-BR')} linhas com processo\n`);
    } catch (e) {
      console.log(` ERRO: ${e.message}`);
      continue;
    }

    // 2. Busca DB rows sem processo
    const dbRows = await fetchDbRows(year);
    if (!dbRows.length) {
      console.log('   ✅ Todas as linhas já têm processo!');
      continue;
    }

    // 3. Match fingerprint
    let matched = 0, unmatched = 0;
    // Agrupar: chave = "desc|num" → [ids]
    const groups = new Map();
    for (const row of dbRows) {
      const key = fp(row);
      const proc = excelMap.get(key);
      if (proc) {
        const gk = `${proc.descricao_processo ?? ''}|${proc.numero_processo ?? ''}`;
        if (!groups.has(gk)) groups.set(gk, { ...proc, ids: [] });
        groups.get(gk).ids.push(row.id);
        matched++;
      } else {
        unmatched++;
      }
    }
    console.log(`   Match: ${matched.toLocaleString('pt-BR')} ✓  |  ${unmatched.toLocaleString('pt-BR')} sem match`);
    console.log(`   Grupos únicos (desc+num): ${groups.size}`);

    // 4. PATCH por grupo
    let yearUpdated = 0;
    let groupIdx = 0;
    for (const [gk, group] of groups) {
      groupIdx++;
      const values = {};
      if (group.descricao_processo) values.descricao_processo = group.descricao_processo;
      if (group.numero_processo) values.numero_processo = group.numero_processo;
      if (!Object.keys(values).length) continue;

      const done = await patchBatch(group.ids, values);
      yearUpdated += done;
      if (groupIdx % 50 === 0 || groupIdx === groups.size) {
        process.stdout.write(`\r   PATCH ${year}: ${yearUpdated.toLocaleString('pt-BR')}/${matched.toLocaleString('pt-BR')} atualizados (${groupIdx}/${groups.size} grupos)`);
      }
    }
    console.log(`\n   ✅ ${year}: ${yearUpdated.toLocaleString('pt-BR')} linhas atualizadas`);
    totalUpdated += yearUpdated;
  }

  console.log(`\n══════════════════════════════════════════════════════`);
  console.log(`  TOTAL: ${totalUpdated.toLocaleString('pt-BR')} linhas atualizadas`);
  console.log(`══════════════════════════════════════════════════════\n`);

  // Verificação
  console.log('Verificação final...');
  for (const col of ['descricao_processo', 'numero_processo']) {
    const url = `${SUPA_URL}/rest/v1/lc131_despesas?select=${col}&${col}=not.is.null&limit=0`;
    const r = await fetch(url, { headers: { ...hdrs, Prefer: 'count=exact' } });
    const range = r.headers.get('content-range');
    console.log(`  ${col}: ${range}`);
  }
}

main().catch(e => console.error('FATAL:', e));
