'use strict';
/**
 * Migra dados do Supabase → Appwrite
 * - Usa Supabase Management API (contorna restrição de quota)
 * - Importa 470k docs para lc131_despesas (Appwrite)
 * - Pre-computa cache (dashboard, map, distincts) por ano
 *
 * Run: node scripts/migrate-to-appwrite.cjs
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https = require('https');

// ──────────────────────────── Config ────────────────────────────
const SUPABASE_TOKEN = process.env.SUPABASE_TOKEN || ''; // set via env var before running
const SUPABASE_REF   = 'teikzwrfsxjipxozzhbr';
const AW_ENDPOINT    = 'https://fra.cloud.appwrite.io/v1';
const AW_PROJECT     = '69ea271e000d28e3afce';
const AW_DATABASE    = '69ea274b00316d3d1dfb';
const AW_API_KEY     = 'standard_8834bd8610e14b14457c14af3d1ebaa4de0a89405faeb1186a02d517d251b31c125896555137773df5d8fc00f87bb0f67b032cdb5f2dea1b6d4841b9b0d46e8022df8202ccd30b5b9046bf190eb9f5c0e26501ffbc89527f94e8c95eb14c627af38568f0647b64973868741b16b8e2d0ac257b8b1a838600c24a7d6120edf204';
const COLLECTION     = 'lc131_despesas';
const CACHE_COLL     = 'cache';
const PAGE_SIZE      = 1000;   // rows per Supabase query
const CONCURRENCY    = 25;     // parallel Appwrite inserts

// ──────────────────────────── Supabase API ────────────────────────────
function supaQuery(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const opts = {
      hostname: 'api.supabase.com',
      path: `/v1/projects/${SUPABASE_REF}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, data: d }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ──────────────────────────── Appwrite API ────────────────────────────
function awReq(method, path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const url = new URL(AW_ENDPOINT + path);
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'X-Appwrite-Project': AW_PROJECT,
        'X-Appwrite-Key': AW_API_KEY,
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, data: d }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ──────────────────────────── Compute helpers ────────────────────────────
function computeFonteSimpl(row) {
  const s = String(row.codigo_nome_fonte_recurso || row.fonte_recurso || '').toLowerCase();
  return (s.includes('fed') || s.includes('união') || s.includes('uniao') ||
          s.includes('fundo nacional') || s.includes('transfe') || s.includes('sus'))
    ? 'FEDERAL' : 'ESTADUAL';
}

function computeGrupoSimpl(row) {
  const g = String(row.codigo_nome_grupo || '');
  if (g.startsWith('1')) return 'Pessoal';
  if (g.startsWith('2')) return 'Dívida';
  if (g.startsWith('3')) return 'Custeio';
  if (g.startsWith('4')) return 'Investimento';
  return 'Outros';
}

function numVal(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

function groupSum(rows, keyFn, valueFns) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!k) continue;
    if (!map.has(k)) {
      const init = { _key: k };
      for (const [name] of valueFns) init[name] = 0;
      init._municipios = new Set();
      init._count = 0;
      map.set(k, init);
    }
    const entry = map.get(k);
    for (const [name, fn] of valueFns) entry[name] += fn(r);
    entry._municipios.add(r.municipio || '');
    entry._count++;
  }
  const result = [];
  for (const [k, entry] of map) {
    const obj = { [keyFn._label || 'key']: k };
    for (const [name] of valueFns) obj[name] = Math.round(entry[name] * 100) / 100;
    obj.municipios = entry._municipios.size;
    obj.registros = entry._count;
    result.push(obj);
  }
  return result.sort((a, b) => (b.empenhado || b.total || 0) - (a.empenhado || a.total || 0));
}

function sumField(rows, field) {
  return Math.round(rows.reduce((s, r) => s + numVal(r[field]), 0) * 100) / 100;
}

const VALUE_FNS = [
  ['empenhado', r => numVal(r.empenhado)],
  ['liquidado', r => numVal(r.liquidado)],
  ['pago', r => numVal(r.pago)],
  ['pago_total', r => numVal(r.pago_total)],
];

function computeDashboard(rows) {
  const kpis = {
    empenhado: sumField(rows, 'empenhado'),
    liquidado: sumField(rows, 'liquidado'),
    pago: sumField(rows, 'pago'),
    pago_total: sumField(rows, 'pago_total'),
    total: rows.length,
    municipios: new Set(rows.map(r => r.municipio)).size,
  };

  function grp(label, keyFn) {
    const fn = r => r[label] || '';
    fn._label = label;
    return groupSum(rows, Object.assign(r => r[keyFn] || '', { _label: keyFn }), VALUE_FNS);
  }

  const byAno = (() => {
    const m = new Map();
    for (const r of rows) {
      const k = r.ano_referencia;
      if (!m.has(k)) m.set(k, { ano: k, empenhado: 0, liquidado: 0, pago: 0, pago_total: 0 });
      const e = m.get(k);
      e.empenhado   += numVal(r.empenhado);
      e.liquidado   += numVal(r.liquidado);
      e.pago        += numVal(r.pago);
      e.pago_total  += numVal(r.pago_total);
    }
    return Array.from(m.values()).map(e => ({
      ...e,
      empenhado: Math.round(e.empenhado * 100) / 100,
      liquidado: Math.round(e.liquidado * 100) / 100,
      pago: Math.round(e.pago * 100) / 100,
      pago_total: Math.round(e.pago_total * 100) / 100,
    })).sort((a, b) => a.ano - b.ano);
  })();

  function grpField(field, keyField) {
    const m = new Map();
    for (const r of rows) {
      const k = r[keyField] || '';
      if (!k) continue;
      if (!m.has(k)) m.set(k, { [keyField]: k, empenhado: 0, liquidado: 0, pago: 0, pago_total: 0, municipios: new Set(), registros: 0 });
      const e = m.get(k);
      e.empenhado  += numVal(r.empenhado);
      e.liquidado  += numVal(r.liquidado);
      e.pago       += numVal(r.pago);
      e.pago_total += numVal(r.pago_total);
      e.municipios.add(r.municipio || '');
      e.registros++;
    }
    return Array.from(m.values()).map(e => ({
      [keyField]: e[keyField],
      empenhado: Math.round(e.empenhado * 100) / 100,
      liquidado: Math.round(e.liquidado * 100) / 100,
      pago: Math.round(e.pago * 100) / 100,
      pago_total: Math.round(e.pago_total * 100) / 100,
      municipios: e.municipios.size,
      registros: e.registros,
    })).sort((a, b) => (b.empenhado || 0) - (a.empenhado || 0));
  }

  function grpSimple(keyField) {
    const m = new Map();
    for (const r of rows) {
      const k = r[keyField] || '';
      if (!k) continue;
      m.set(k, (m.get(k) || 0) + numVal(r.empenhado));
    }
    return Array.from(m.entries())
      .map(([k, v]) => ({ [keyField]: k, empenhado: Math.round(v * 100) / 100 }))
      .sort((a, b) => (b.empenhado || 0) - (a.empenhado || 0));
  }

  // Top favorecidos (top 50 by empenhado)
  const favMap = new Map();
  for (const r of rows) {
    const k = r.codigo_nome_favorecido || '';
    if (!k) continue;
    if (!favMap.has(k)) favMap.set(k, { favorecido: k, empenhado: 0, pago_total: 0, contratos: 0 });
    const e = favMap.get(k);
    e.empenhado  += numVal(r.empenhado);
    e.pago_total += numVal(r.pago_total);
    e.contratos++;
  }
  const por_favorecido = Array.from(favMap.values())
    .map(e => ({ ...e, empenhado: Math.round(e.empenhado * 100) / 100, pago_total: Math.round(e.pago_total * 100) / 100 }))
    .sort((a, b) => b.empenhado - a.empenhado)
    .slice(0, 50);

  return {
    kpis,
    por_ano: byAno,
    por_drs: grpField('empenhado', 'drs'),
    por_rras: grpField('empenhado', 'rras'),
    por_regiao_ad: grpField('empenhado', 'regiao_ad'),
    por_regiao_sa: grpField('empenhado', 'regiao_sa'),
    por_grupo_simpl: grpSimple('grupo_simpl'),
    por_fonte_simpl: grpSimple('fonte_simpl'),
    por_tipo_despesa: grpSimple('tipo_despesa'),
    por_rotulo: grpSimple('rotulo'),
    por_favorecido,
  };
}

function computeMap(rows) {
  const kpis = {
    empenhado: sumField(rows, 'empenhado'),
    liquidado: sumField(rows, 'liquidado'),
    pago: sumField(rows, 'pago'),
    pago_total: sumField(rows, 'pago_total'),
    registros: rows.length,
    municipios: new Set(rows.map(r => r.municipio)).size,
    drs_count: new Set(rows.map(r => r.drs).filter(Boolean)).size,
  };

  function grpRegion(keyField) {
    const m = new Map();
    for (const r of rows) {
      const k = r[keyField] || '';
      if (!k) continue;
      if (!m.has(k)) m.set(k, { name: k, empenhado: 0, liquidado: 0, pago: 0, pago_total: 0, municipios: new Set(), registros: 0 });
      const e = m.get(k);
      e.empenhado  += numVal(r.empenhado);
      e.liquidado  += numVal(r.liquidado);
      e.pago       += numVal(r.pago);
      e.pago_total += numVal(r.pago_total);
      e.municipios.add(r.municipio || '');
      e.registros++;
    }
    return Array.from(m.values()).map(e => ({
      name: e.name,
      empenhado: Math.round(e.empenhado * 100) / 100,
      liquidado: Math.round(e.liquidado * 100) / 100,
      pago: Math.round(e.pago * 100) / 100,
      pago_total: Math.round(e.pago_total * 100) / 100,
      municipios: e.municipios.size,
      registros: e.registros,
    }));
  }

  // Municipios aggregation
  const municMap = new Map();
  for (const r of rows) {
    const k = r.municipio || '';
    if (!k) continue;
    if (!municMap.has(k)) municMap.set(k, {
      municipio: k, drs: r.drs || '', rras: r.rras || '',
      regiao_ad: r.regiao_ad || '', regiao_sa: r.regiao_sa || '',
      empenhado: 0, liquidado: 0, pago: 0, pago_total: 0, registros: 0,
    });
    const e = municMap.get(k);
    e.empenhado  += numVal(r.empenhado);
    e.liquidado  += numVal(r.liquidado);
    e.pago       += numVal(r.pago);
    e.pago_total += numVal(r.pago_total);
    e.registros++;
  }
  const municipios = Array.from(municMap.values()).map(e => ({
    ...e,
    empenhado: Math.round(e.empenhado * 100) / 100,
    liquidado: Math.round(e.liquidado * 100) / 100,
    pago: Math.round(e.pago * 100) / 100,
    pago_total: Math.round(e.pago_total * 100) / 100,
  }));

  return {
    kpis,
    por_drs: grpRegion('drs'),
    por_rras: grpRegion('rras'),
    por_regiao_ad: grpRegion('regiao_ad'),
    por_regiao_sa: grpRegion('regiao_sa'),
    municipios,
  };
}

function computeDistincts(rows) {
  const uniq = field => [...new Set(rows.map(r => r[field] || '').filter(Boolean))].sort();
  return {
    distinct_drs:           uniq('drs'),
    distinct_regiao_ad:     uniq('regiao_ad'),
    distinct_rras:          uniq('rras'),
    distinct_regiao_sa:     uniq('regiao_sa'),
    distinct_municipio:     uniq('municipio'),
    distinct_grupo:         uniq('codigo_nome_grupo'),
    distinct_tipo:          uniq('tipo_despesa'),
    distinct_rotulo:        uniq('rotulo'),
    distinct_fonte:         [...new Set(rows.map(r => computeFonteSimpl(r)))].sort(),
    distinct_codigo_ug:     uniq('codigo_ug'),
    distinct_uo:            uniq('codigo_nome_uo'),
    distinct_elemento:      uniq('codigo_nome_elemento'),
    distinct_favorecido:    uniq('codigo_nome_favorecido'),
  };
}

// ──────────────────────────── Cache write ────────────────────────────
async function writeCache(id, data) {
  const payload = {
    cache_key: id,
    data: JSON.stringify(data),
    updated_at: new Date().toISOString(),
  };
  const dataSize = Buffer.byteLength(payload.data);
  if (dataSize > 130000) {
    // Trim por_favorecido if needed
    if (data.por_favorecido) data.por_favorecido = data.por_favorecido.slice(0, 20);
    if (data.municipios) data.municipios = data.municipios.slice(0, 500);
    payload.data = JSON.stringify(data);
  }

  // Try upsert (update if exists, create if not)
  const upd = await awReq('PATCH', `/databases/${AW_DATABASE}/collections/${CACHE_COLL}/documents/${id}`, { data: payload });
  if (upd.status === 200 || upd.status === 201) { console.log(`  Cache updated: ${id}`); return; }
  const cre = await awReq('POST', `/databases/${AW_DATABASE}/collections/${CACHE_COLL}/documents`, {
    documentId: id, data: payload,
  });
  if (cre.status === 201) { console.log(`  Cache created: ${id}`); }
  else { console.warn(`  Cache WARN ${id}: ${cre.status} ${JSON.stringify(cre.data?.message || cre.data)}`); }
}

// ──────────────────────────── Appwrite document insert ────────────────────────────
async function insertDoc(row, retries = 3) {
  const docId = String(row.id);
  const doc = {
    ano_referencia:                  row.ano_referencia ?? null,
    municipio:                       row.municipio || null,
    nome_municipio:                  row.nome_municipio || null,
    drs:                             row.drs || null,
    rras:                            row.rras || null,
    regiao_ad:                       row.regiao_ad || null,
    regiao_sa:                       row.regiao_sa || null,
    cod_ibge:                        row.cod_ibge || null,
    codigo_nome_uo:                  row.codigo_nome_uo || null,
    codigo_ug:                       row.codigo_ug != null ? Number(row.codigo_ug) : null,
    codigo_nome_ug:                  row.codigo_nome_ug || null,
    codigo_projeto_atividade:        row.codigo_projeto_atividade || null,
    codigo_nome_projeto_atividade:   row.codigo_nome_projeto_atividade || null,
    codigo_nome_fonte_recurso:       row.codigo_nome_fonte_recurso || null,
    fonte_recurso:                   row.fonte_recurso || null,
    codigo_nome_grupo:               row.codigo_nome_grupo || null,
    grupo_despesa:                   row.grupo_despesa || null,
    codigo_nome_elemento:            row.codigo_nome_elemento || null,
    codigo_elemento:                 row.codigo_elemento || null,
    codigo_nome_favorecido:          row.codigo_nome_favorecido || null,
    codigo_favorecido:               row.codigo_favorecido || null,
    descricao_processo:              row.descricao_processo || null,
    numero_processo:                 row.numero_processo || null,
    unidade:                         row.unidade || null,
    rotulo:                          row.rotulo || null,
    tipo_despesa:                    row.tipo_despesa || null,
    tipo_despesa_classif:            row.tipo_despesa_classif || null,
    empenhado:                       numVal(row.empenhado),
    liquidado:                       numVal(row.liquidado),
    pago:                            numVal(row.pago),
    pago_anos_anteriores:            numVal(row.pago_anos_anteriores),
    pago_total:                      numVal(row.pago_total),
    fonte_simpl:                     computeFonteSimpl(row),
    grupo_simpl:                     computeGrupoSimpl(row),
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    const r = await awReq('POST', `/databases/${AW_DATABASE}/collections/${COLLECTION}/documents`, {
      documentId: docId, data: doc,
    });
    if (r.status === 201) return { ok: true };
    if (r.status === 409) return { ok: true, skipped: true }; // already exists
    if (attempt < retries) await sleep(500 * attempt);
    else return { ok: false, error: `${r.status}: ${JSON.stringify(r.data?.message || r.data)}` };
  }
}

// Concurrent batch runner
async function runConcurrent(tasks, concurrency) {
  let idx = 0; let done = 0; let errors = 0; let firstError = null;
  const total = tasks.length;
  const workers = Array.from({ length: concurrency }, async () => {
    while (idx < total) {
      const i = idx++;
      const result = await tasks[i]();
      done++;
      if (!result?.ok) {
        errors++;
        if (!firstError && result?.error) firstError = result.error;
      }
      if (done % 1000 === 0) process.stdout.write(`\r    Progress: ${done}/${total} (${errors} errors)`);
    }
  });
  await Promise.all(workers);
  process.stdout.write(`\r    Progress: ${done}/${total} (${errors} errors)\n`);
  if (firstError) console.warn(`    First error sample: ${firstError}`);
  return errors;
}

// ──────────────────────────── Main migration ────────────────────────────
async function main() {
  console.log('=== Migração Supabase → Appwrite ===\n');
  console.log(`Total estimado: 470,947 registros em 5 anos\n`);

  // 1. Get all years
  const yearsRes = await supaQuery('SELECT DISTINCT ano_referencia FROM lc131_despesas ORDER BY ano_referencia');
  const years = yearsRes.data.map(r => r.ano_referencia);
  console.log('Anos encontrados:', years.join(', '));

  const allRowsForCache = []; // all rows for final "todos" cache computation

  for (const ano of years) {
    console.log(`\n─── Processando ano ${ano} ───`);

    // 2. Count rows for this year
    const cntRes = await supaQuery(`SELECT COUNT(*) as total FROM lc131_despesas WHERE ano_referencia = ${ano}`);
    const total = parseInt(cntRes.data[0].total);
    console.log(`  Total: ${total} registros`);

    // 3. Export year data page by page from Supabase
    const yearRows = [];
    let lastId = 0;
    let page = 0;
    process.stdout.write(`  Exportando do Supabase: `);
    while (true) {
      const res = await supaQuery(
        `SELECT * FROM lc131_despesas WHERE ano_referencia = ${ano} AND id > ${lastId} ORDER BY id LIMIT ${PAGE_SIZE}`
      );
      if (!res.data || res.data.length === 0) break;
      yearRows.push(...res.data);
      lastId = res.data[res.data.length - 1].id;
      page++;
      process.stdout.write('.');
      if (res.data.length < PAGE_SIZE) break;
    }
    console.log(` ${yearRows.length} linhas exportadas`);

    // 4. Import to Appwrite (concurrent)
    console.log(`  Importando para Appwrite (concurrency=${CONCURRENCY})...`);
    const tasks = yearRows.map(row => () => insertDoc(row));
    const errors = await runConcurrent(tasks, CONCURRENCY);
    console.log(`  Importação concluída: ${yearRows.length - errors} ok, ${errors} errors`);

    // 5. Compute and store cache for this year
    console.log(`  Computando cache para ${ano}...`);
    const dashData = computeDashboard(yearRows);
    const mapData  = computeMap(yearRows);
    const distData = computeDistincts(yearRows);

    await writeCache(`dashboard_${ano}`, dashData);
    await writeCache(`map_${ano}`, mapData);
    await writeCache(`distincts_${ano}`, distData);

    // 6. Pre-compute per-DRS cache for this year (for fast filtered dashboard)
    const drsGroups = {};
    for (const row of yearRows) {
      const d = row.drs || 'SEM DRS';
      if (!drsGroups[d]) drsGroups[d] = [];
      drsGroups[d].push(row);
    }
    for (const [drs, rows] of Object.entries(drsGroups)) {
      const drsId = drs.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase().slice(0, 50);
      const cacheId = `dashboard_${ano}_drs_${drsId}`;
      await writeCache(cacheId, computeDashboard(rows));
    }
    console.log(`  Cache DRS escrito: ${Object.keys(drsGroups).length} regiões`);

    allRowsForCache.push(...yearRows);
  }

  // 7. Compute "todos" (all years combined)
  console.log('\n─── Computando cache para todos os anos ───');
  await writeCache('dashboard_todos', computeDashboard(allRowsForCache));
  await writeCache('map_todos', computeMap(allRowsForCache));
  await writeCache('distincts_todos', computeDistincts(allRowsForCache));

  console.log('\n=== Migração concluída! ===');
  console.log('Próximo passo: node scripts/deploy-appwrite-functions.cjs');
}

main().catch(e => { console.error('\nFATAL:', e.message, e.stack); process.exit(1); });
