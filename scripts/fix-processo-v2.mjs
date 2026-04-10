/**
 * fix-processo-v2.mjs – estratégia otimizada
 * 
 * 1. Lê TODOS os Excels e cria mapa global fingerprint → processo
 * 2. Percorre TODA a tabela lc131_despesas por cursor (id), sem filtro de ano
 * 3. Acumula IDs agrupados por (descricao, numero) para PATCH em lote
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

// ── Lê Excel ─────────────────────────────────────
function readExcel(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  let hIdx = 0;
  for (let i = 0; i < Math.min(10, raw.length); i++) {
    const row = raw[i];
    const ne = row.filter(v => v !== '' && v != null);
    const txt = ne.filter(v => typeof v === 'string' && isNaN(Number(v)));
    if (ne.length >= 3 && txt.length / ne.length > 0.6) { hIdx = i; break; }
  }
  const headers = raw[hIdx].map(normalizeColName);
  const dataStart = hIdx + 1;
  const numCols = new Set(headers.filter(h => {
    const idx = headers.indexOf(h);
    return isNumericCol(raw.slice(dataStart, dataStart + 50).map(r => r[idx]));
  }));

  const SKIP = ['total geral', 'total', 'subtotal'];
  const map = new Map();
  let count = 0;

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

    map.set(fp(row), {
      descricao_processo: desc ? String(desc) : null,
      numero_processo: num ? String(num) : null,
    });
    count++;
  }
  return { map, count };
}

// ── PATCH em lote ────────────────────────────────
async function patchGroup(ids, values) {
  const BATCH = 300;
  let done = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const filter = `id=in.(${chunk.join(',')})`;
    const url = `${SUPA_URL}/rest/v1/lc131_despesas?${filter}`;
    let r = await fetch(url, { method: 'PATCH', headers: hdrs, body: JSON.stringify(values) });
    if (!r.ok && r.status === 500) {
      await new Promise(ok => setTimeout(ok, 2000));
      r = await fetch(url, { method: 'PATCH', headers: hdrs, body: JSON.stringify(values) });
    }
    if (!r.ok) {
      console.error(`\n   PATCH ERR ${r.status}: ${(await r.text()).substring(0, 200)}`);
    } else {
      done += chunk.length;
    }
  }
  return done;
}

// ── Main ─────────────────────────────────────────
async function main() {
  console.log('══════════════════════════════════════════════════════');
  console.log('  FIX descricao_processo + numero_processo (v2)');
  console.log('══════════════════════════════════════════════════════\n');

  // 1. Carregar TODOS os Excels em um mapa global
  const FILES = [
    'C:\\Users\\afpereira\\Downloads\\LC31\\LC_131_2022.xlsx',
    'C:\\Users\\afpereira\\Downloads\\LC31\\LC_131_2023.xlsx',
    'C:\\Users\\afpereira\\Downloads\\LC31\\LC_131_2024.xlsx',
    'C:\\Users\\afpereira\\Downloads\\LC31\\LC_131_2025.xlsx',
    'C:\\Users\\afpereira\\Downloads\\LC31\\LC_131_2026.xlsx',
  ];

  const globalMap = new Map();
  for (const f of FILES) {
    const name = f.split('\\').pop();
    process.stdout.write(`   Lendo ${name}...`);
    try {
      const { map, count } = readExcel(f);
      for (const [k, v] of map) globalMap.set(k, v);
      console.log(` ${count.toLocaleString('pt-BR')} linhas`);
    } catch (e) {
      console.log(` ERRO: ${e.message}`);
    }
  }
  console.log(`   → Mapa global: ${globalMap.size.toLocaleString('pt-BR')} fingerprints\n`);

  // 2. Percorrer TODA a tabela por cursor (sem filtro de ano)
  console.log('   Lendo tabela DB (cursor por id, sem filtro ano)...');
  const sel = ['id', 'descricao_processo', ...FP_COLS].join(',');
  const PAGE = 500;
  let lastId = 0;
  let totalRead = 0, needUpdate = 0, matched = 0;
  
  // Agrupar: "desc|num" → [ids]
  const groups = new Map();
  let retries = 0;

  while (true) {
    const url = `${SUPA_URL}/rest/v1/lc131_despesas?select=${sel}&id=gt.${lastId}&order=id&limit=${PAGE}`;
    const r = await fetch(url, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } });
    if (!r.ok) {
      const txt = await r.text();
      if (r.status === 500 && txt.includes('timeout') && retries < 5) {
        retries++;
        await new Promise(ok => setTimeout(ok, 3000));
        continue;
      }
      console.error(`\n   DB ERR at id>${lastId}: ${r.status} ${txt.substring(0, 200)}`);
      break;
    }
    retries = 0;
    const data = await r.json();
    if (!data.length) break;
    totalRead += data.length;
    lastId = data[data.length - 1].id;

    for (const row of data) {
      if (row.descricao_processo) continue; // já tem
      needUpdate++;
      const key = fp(row);
      const proc = globalMap.get(key);
      if (proc) {
        matched++;
        const gk = `${proc.descricao_processo ?? ''}|${proc.numero_processo ?? ''}`;
        if (!groups.has(gk)) groups.set(gk, { ...proc, ids: [] });
        groups.get(gk).ids.push(row.id);
      }
    }

    if (totalRead % 5000 === 0 || data.length < PAGE) {
      process.stdout.write(`\r   DB: ${totalRead.toLocaleString('pt-BR')} lidos, ${matched.toLocaleString('pt-BR')} matched, ${groups.size} grupos`);
    }
    if (data.length < PAGE) break;
  }
  console.log(`\n   → ${totalRead.toLocaleString('pt-BR')} total, ${needUpdate.toLocaleString('pt-BR')} sem processo, ${matched.toLocaleString('pt-BR')} matched\n`);

  // 3. PATCH por grupo
  console.log(`   Atualizando ${groups.size} grupos...`);
  let totalUpdated = 0;
  let gIdx = 0;
  for (const [gk, group] of groups) {
    gIdx++;
    const values = {};
    if (group.descricao_processo) values.descricao_processo = group.descricao_processo;
    if (group.numero_processo) values.numero_processo = group.numero_processo;
    if (!Object.keys(values).length) continue;

    const done = await patchGroup(group.ids, values);
    totalUpdated += done;
    if (gIdx % 20 === 0 || gIdx === groups.size) {
      process.stdout.write(`\r   PATCH: ${totalUpdated.toLocaleString('pt-BR')}/${matched.toLocaleString('pt-BR')} atualizados (${gIdx}/${groups.size} grupos)  `);
    }
  }

  console.log(`\n\n══════════════════════════════════════════════════════`);
  console.log(`  TOTAL: ${totalUpdated.toLocaleString('pt-BR')} linhas atualizadas`);
  console.log(`══════════════════════════════════════════════════════\n`);

  // Verificação
  console.log('Verificação...');
  for (const col of ['descricao_processo', 'numero_processo']) {
    const url = `${SUPA_URL}/rest/v1/lc131_despesas?select=${col}&${col}=not.is.null&limit=0`;
    const r = await fetch(url, { headers: { ...hdrs, Prefer: 'count=exact' } });
    const range = r.headers.get('content-range');
    console.log(`  ${col}: ${range}`);
  }
}

main().catch(e => console.error('FATAL:', e));
