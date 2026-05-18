/**
 * Appwrite Function: lc131-dashboard (ROUTER)
 * Rota todas as ações via campo "action" no body:
 *   action: 'dashboard' (default) — agregação do painel
 *   action: 'distincts' — valores distintos para filtros
 *   action: 'detail'    — registros paginados
 *   action: 'pivot'     — pivot multi-dimensional
 *   action: 'delete_year' — deleta documentos de um ano
 *   action: 'cleanup'   — reconstrói cache de um ano
 */
'use strict';
const https = require('https');

const DB_ID = '69ea274b00316d3d1dfb';
const COLL  = 'lc131_despesas';
const CACHE = 'cache';
const LIMIT = 5000;

// ── Query helpers ──
function qEq(field, vals) {
  const a = Array.isArray(vals) ? vals : [vals];
  const v = a.map(x => typeof x === 'number' ? String(x) : `"${String(x).replace(/"/g,'\\\"')}"`).join(',');
  return `equal("${field}",[${v}])`;
}
function buildQS(queries) {
  return queries.map(q => 'queries[]=' + encodeURIComponent(q)).join('&');
}

// ── HTTP helpers ──
function awReq(endpoint, method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint + path);
    const payload = body ? JSON.stringify(body) : undefined;
    const headers = {
      'X-Appwrite-Project': process.env.APPWRITE_FUNCTION_PROJECT_ID,
      'X-Appwrite-Key': process.env.APPWRITE_API_KEY,
      'Content-Type': 'application/json',
    };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    const opts = { hostname: url.hostname, path: url.pathname + url.search, method, headers };
    const req = https.request(opts, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { resolve({ status: r.statusCode, data: JSON.parse(d) }); } catch(e) { resolve({ status: r.statusCode, data: {} }); } });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}
const awGet = (endpoint, path) => awReq(endpoint, 'GET', path, null);

async function fetchAll(endpoint, extraQ, collId) {
  const cid = collId || COLL;
  const docs = []; let offset = 0;
  while (true) {
    const q = [...extraQ, `limit(${LIMIT})`, ...(offset > 0 ? [`offset(${offset})`] : [])];
    const r = await awGet(endpoint, `/databases/${DB_ID}/collections/${cid}/documents?${buildQS(q)}`);
    if (!r.data || !r.data.documents) break;
    docs.push(...r.data.documents);
    if (r.data.documents.length < LIMIT) break;
    offset += LIMIT;
  }
  return docs;
}

// ── Filter builder ──
const PARAM_TO_COL = {
  p_drs: 'drs', p_regiao_ad: 'regiao_ad', p_rras: 'rras', p_regiao_sa: 'regiao_sa',
  p_municipio: 'municipio', p_grupo_despesa: 'codigo_nome_grupo', p_tipo_despesa: 'tipo_despesa',
  p_rotulo: 'rotulo', p_uo: 'codigo_nome_uo', p_elemento: 'codigo_nome_elemento',
  p_favorecido: 'codigo_nome_favorecido', p_codigo_ug: 'codigo_ug',
  p_fonte_recurso: 'fonte_simpl',
};

function buildQueries(p) {
  const q = [];
  if (p.p_ano) q.push(qEq('ano_referencia', [Number(p.p_ano)]));
  for (const [param, col] of Object.entries(PARAM_TO_COL)) {
    const val = p[param];
    if (!val) continue;
    const vals = String(val).split('|').filter(Boolean);
    if (vals.length > 0) q.push(qEq(col, vals));
  }
  return q;
}

// ── Aggregation helpers ──
const N = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

function grpField(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = r[key] || ''; if (!k) continue;
    const e = m.get(k) || { [key]: k, empenhado: 0, liquidado: 0, pago: 0, pago_total: 0, municipios: new Set(), registros: 0 };
    e.empenhado += N(r.empenhado); e.liquidado += N(r.liquidado);
    e.pago += N(r.pago); e.pago_total += N(r.pago_total);
    e.municipios.add(r.municipio || ''); e.registros++;
    m.set(k, e);
  }
  return Array.from(m.values()).map(e => ({
    [key]: e[key], empenhado: Math.round(e.empenhado*100)/100, liquidado: Math.round(e.liquidado*100)/100,
    pago: Math.round(e.pago*100)/100, pago_total: Math.round(e.pago_total*100)/100,
    municipios: e.municipios.size, registros: e.registros,
  })).sort((a, b) => b.empenhado - a.empenhado);
}

function grpSimple(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = r[key] || ''; if (!k) continue;
    const e = m.get(k) || { [key]: k, empenhado: 0, liquidado: 0, pago: 0, pago_total: 0 };
    e.empenhado += N(r.empenhado); e.liquidado += N(r.liquidado);
    e.pago += N(r.pago); e.pago_total += N(r.pago_total);
    m.set(k, e);
  }
  return Array.from(m.values()).map(e => ({
    [key]: e[key], empenhado: Math.round(e.empenhado*100)/100, liquidado: Math.round(e.liquidado*100)/100,
    pago: Math.round(e.pago*100)/100, pago_total: Math.round(e.pago_total*100)/100,
  })).sort((a, b) => b.empenhado - a.empenhado);
}

function computeDashboard(docs) {
  const kpis = { empenhado: 0, liquidado: 0, pago: 0, pago_total: 0, total: docs.length, municipios: 0 };
  const munics = new Set();
  for (const r of docs) {
    kpis.empenhado += N(r.empenhado); kpis.liquidado += N(r.liquidado);
    kpis.pago += N(r.pago); kpis.pago_total += N(r.pago_total);
    munics.add(r.municipio || '');
  }
  kpis.municipios = munics.size;
  kpis.empenhado = Math.round(kpis.empenhado*100)/100;
  kpis.liquidado = Math.round(kpis.liquidado*100)/100;
  kpis.pago = Math.round(kpis.pago*100)/100;
  kpis.pago_total = Math.round(kpis.pago_total*100)/100;

  const anoMap = new Map();
  for (const r of docs) {
    const k = r.ano_referencia;
    const e = anoMap.get(k) || { ano: k, empenhado: 0, liquidado: 0, pago: 0, pago_total: 0, registros: 0 };
    e.empenhado += N(r.empenhado); e.liquidado += N(r.liquidado);
    e.pago += N(r.pago); e.pago_total += N(r.pago_total); e.registros++;
    anoMap.set(k, e);
  }
  const por_ano = Array.from(anoMap.values()).map(e => ({
    ano: e.ano, empenhado: Math.round(e.empenhado*100)/100, liquidado: Math.round(e.liquidado*100)/100,
    pago: Math.round(e.pago*100)/100, pago_total: Math.round(e.pago_total*100)/100, registros: e.registros,
  })).sort((a, b) => a.ano - b.ano);

  function top50(keyField, displayKey) {
    const m = new Map();
    for (const r of docs) {
      const k = r[keyField] || ''; if (!k) continue;
      const e = m.get(k) || { [displayKey]: k, empenhado: 0, pago_total: 0 };
      e.empenhado += N(r.empenhado); e.pago_total += N(r.pago_total); m.set(k, e);
    }
    return Array.from(m.values()).map(e => ({ ...e, empenhado: Math.round(e.empenhado*100)/100, pago_total: Math.round(e.pago_total*100)/100 })).sort((a, b) => b.empenhado - a.empenhado).slice(0, 50);
  }

  function topN(keyField, displayKey, n) {
    const m = new Map();
    for (const r of docs) {
      const k = r[keyField] || ''; if (!k) continue;
      const e = m.get(k) || { [displayKey]: k, empenhado: 0, liquidado: 0, pago_total: 0 };
      e.empenhado += N(r.empenhado); e.liquidado += N(r.liquidado); e.pago_total += N(r.pago_total); m.set(k, e);
    }
    return Array.from(m.values()).map(e => ({ ...e, empenhado: Math.round(e.empenhado*100)/100, liquidado: Math.round(e.liquidado*100)/100, pago_total: Math.round(e.pago_total*100)/100 })).sort((a, b) => b.empenhado - a.empenhado).slice(0, n);
  }

  return {
    kpis, por_ano,
    por_drs: grpField(docs, 'drs'), por_rras: grpField(docs, 'rras'),
    por_regiao_ad: grpField(docs, 'regiao_ad'), por_regiao_sa: grpField(docs, 'regiao_sa'),
    por_grupo: grpField(docs, 'grupo_despesa'), por_grupo_simpl: grpSimple(docs, 'grupo_simpl'),
    por_fonte_simpl: grpSimple(docs, 'fonte_simpl'), por_tipo_despesa: grpSimple(docs, 'tipo_despesa'),
    por_rotulo: grpSimple(docs, 'rotulo'),
    por_favorecido: top50('codigo_nome_favorecido', 'favorecido'),
    por_projeto: top50('codigo_nome_projeto_atividade', 'projeto'),
    por_ug: topN('codigo_nome_ug', 'ug', 100), por_uo: topN('codigo_nome_uo', 'uo', 100),
    por_fonte: topN('codigo_nome_fonte_recurso', 'fonte_recurso', 100),
    por_municipio: topN('municipio', 'municipio', 1000),
    por_elemento: topN('codigo_nome_elemento', 'elemento', 200),
  };
}

// ── Distincts ──
function computeDistincts(docs) {
  const uniq = fn => Array.from(new Set(docs.map(fn).filter(Boolean))).sort();
  return {
    distinct_drs:        uniq(r => r.drs),
    distinct_regiao_ad:  uniq(r => r.regiao_ad),
    distinct_rras:       uniq(r => r.rras),
    distinct_regiao_sa:  uniq(r => r.regiao_sa),
    distinct_municipio:  uniq(r => r.municipio),
    distinct_grupo:      uniq(r => r.codigo_nome_grupo || r.grupo_despesa),
    distinct_tipo:       uniq(r => r.tipo_despesa),
    distinct_rotulo:     uniq(r => r.rotulo),
    distinct_fonte:      uniq(r => r.fonte_simpl),
    distinct_codigo_ug:  uniq(r => r.codigo_ug),
    distinct_uo:         uniq(r => r.codigo_nome_uo),
    distinct_elemento:   uniq(r => r.codigo_nome_elemento),
    distinct_favorecido: uniq(r => r.codigo_nome_favorecido),
  };
}

// ── Map ──
function computeMap(docs) {
  const kpis = { empenhado: 0, liquidado: 0, pago: 0, pago_total: 0, registros: docs.length, municipios: 0, drs_count: 0 };
  const allMunic = new Set(), allDrs = new Set();
  const drMap = {}, rrMap = {}, adMap = {}, saMap = {}, mMap = {};
  for (const r of docs) {
    const e = N(r.empenhado), l = N(r.liquidado), p = N(r.pago), pt = N(r.pago_total);
    kpis.empenhado += e; kpis.liquidado += l; kpis.pago += p; kpis.pago_total += pt;
    if (r.municipio) allMunic.add(r.municipio);
    if (r.drs) allDrs.add(r.drs);
    function addReg(map, k) {
      if (!k) return;
      if (!map[k]) map[k] = { empenhado: 0, liquidado: 0, pago: 0, pago_total: 0, municipios: new Set(), registros: 0 };
      map[k].empenhado += e; map[k].liquidado += l; map[k].pago += p; map[k].pago_total += pt;
      map[k].municipios.add(r.municipio || ''); map[k].registros++;
    }
    addReg(drMap, r.drs); addReg(rrMap, r.rras); addReg(adMap, r.regiao_ad); addReg(saMap, r.regiao_sa);
    const mk = r.municipio || '';
    if (mk) {
      if (!mMap[mk]) mMap[mk] = { municipio: mk, drs: r.drs||'', rras: r.rras||'', regiao_ad: r.regiao_ad||'', regiao_sa: r.regiao_sa||'', empenhado: 0, liquidado: 0, pago: 0, pago_total: 0, registros: 0 };
      mMap[mk].empenhado += e; mMap[mk].liquidado += l; mMap[mk].pago += p; mMap[mk].pago_total += pt; mMap[mk].registros++;
    }
  }
  kpis.municipios = allMunic.size; kpis.drs_count = allDrs.size;
  kpis.empenhado = Math.round(kpis.empenhado*100)/100; kpis.liquidado = Math.round(kpis.liquidado*100)/100;
  kpis.pago = Math.round(kpis.pago*100)/100; kpis.pago_total = Math.round(kpis.pago_total*100)/100;
  function regArr(map, nameKey) {
    return Object.entries(map).map(([k, v]) => {
      const o = {}; o[nameKey] = k;
      o.empenhado = Math.round(v.empenhado*100)/100; o.liquidado = Math.round(v.liquidado*100)/100;
      o.pago = Math.round(v.pago*100)/100; o.pago_total = Math.round(v.pago_total*100)/100;
      o.municipios = v.municipios.size; o.registros = v.registros;
      return o;
    });
  }
  return {
    kpis, por_drs: regArr(drMap, 'drs'), por_rras: regArr(rrMap, 'rras'),
    por_regiao_ad: regArr(adMap, 'regiao_ad'), por_regiao_sa: regArr(saMap, 'regiao_sa'),
    municipios: Object.values(mMap).map(v => ({
      ...v, empenhado: Math.round(v.empenhado*100)/100, liquidado: Math.round(v.liquidado*100)/100,
      pago: Math.round(v.pago*100)/100, pago_total: Math.round(v.pago_total*100)/100,
    })),
  };
}

// ── Cache upsert ──
function awUpsert(endpoint, docId, data) {
  const payload = JSON.stringify({ data: JSON.stringify(data), cache_key: docId, updated_at: new Date().toISOString() });
  function tryCreate() {
    return awReq(endpoint, 'POST', `/databases/${DB_ID}/collections/${CACHE}/documents`, JSON.parse(payload)).then(r => {
      if (r.status === 409) return tryUpdate();
      return r;
    });
  }
  function tryUpdate() {
    return awReq(endpoint, 'PATCH', `/databases/${DB_ID}/collections/${CACHE}/documents/${docId}`, JSON.parse(payload));
  }
  // The document needs $id field for creation
  const createBody = { data: JSON.stringify(data), cache_key: docId, updated_at: new Date().toISOString() };
  return new Promise(async (resolve, reject) => {
    try {
      const r1 = await awReq(endpoint, 'POST', `/databases/${DB_ID}/collections/${CACHE}/documents/${docId}`, createBody);
      if (r1.status === 409 || r1.status === 200) {
        const r2 = await awReq(endpoint, 'PATCH', `/databases/${DB_ID}/collections/${CACHE}/documents/${docId}`, createBody);
        resolve(r2);
      } else resolve(r1);
    } catch(e) { reject(e); }
  });
}

// ── DIM mapping for pivot ──
const DIM_TO_COL = {
  drs:'drs', rras:'rras', regiao_ad:'regiao_ad', regiao_sa:'regiao_sa',
  municipio:'municipio', grupo_simpl:'grupo_simpl', fonte_simpl:'fonte_simpl',
  tipo_despesa:'tipo_despesa', rotulo:'rotulo', ano_referencia:'ano_referencia',
  grupo_despesa:'grupo_despesa', codigo_nome_uo:'codigo_nome_uo',
  codigo_nome_elemento:'codigo_nome_elemento',
};

// ════════════════════ MAIN ROUTER ════════════════════
module.exports = async function(req, res) {
  const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
  const p = req.body || {};
  const action = p.action || 'dashboard';

  try {
    // ── DASHBOARD ──
    if (action === 'dashboard') {
      const queries = buildQueries(p);
      const hasFilters = queries.length > (p.p_ano ? 1 : 0);
      if (!hasFilters) {
        const cacheId = p.p_ano ? `dashboard_${p.p_ano}` : 'dashboard_todos';
        const cached = await awGet(endpoint, `/databases/${DB_ID}/collections/${CACHE}/documents/${cacheId}`);
        if (cached.data && cached.data.data) {
          try { return res.json(JSON.parse(cached.data.data), 200); } catch { /* fall through */ }
        }
      }
      const docs = await fetchAll(endpoint, queries);
      return res.json(computeDashboard(docs), 200);
    }

    // ── DISTINCTS ──
    if (action === 'distincts') {
      const queries = buildQueries(p);
      const hasFilters = queries.length > (p.p_ano ? 1 : 0);
      if (!hasFilters) {
        const cacheId = p.p_ano ? `distincts_${p.p_ano}` : 'distincts_todos';
        const cached = await awGet(endpoint, `/databases/${DB_ID}/collections/${CACHE}/documents/${cacheId}`);
        if (cached.data && cached.data.data) {
          try { return res.json(JSON.parse(cached.data.data), 200); } catch { /* fall through */ }
        }
      }
      const docs = await fetchAll(endpoint, queries);
      return res.json(computeDistincts(docs), 200);
    }

    // ── DETAIL (paginated) ──
    if (action === 'detail') {
      const lim = Math.min(Number(p.p_limit) || 500, 5000);
      const off = Number(p.p_offset) || 0;
      const queries = ['orderDesc("empenhado")'];
      if (p.p_ano) queries.push(qEq('ano_referencia', [Number(p.p_ano)]));
      for (const [param, col] of Object.entries(PARAM_TO_COL)) {
        const val = p[param]; if (!val) continue;
        const vals = String(val).split('|').filter(Boolean);
        if (vals.length > 0) queries.push(qEq(col, vals));
      }
      queries.push(`limit(${lim})`);
      if (off > 0) queries.push(`offset(${off})`);
      const r = await awGet(endpoint, `/databases/${DB_ID}/collections/${COLL}/documents?${buildQS(queries)}`);
      return res.json({ rows: (r.data && r.data.documents) || [], total: (r.data && r.data.total) || 0 }, 200);
    }

    // ── PIVOT ──
    if (action === 'pivot') {
      const dims = [p.p_dim1, p.p_dim2, p.p_dim3, p.p_dim4].map(d => DIM_TO_COL[d] || null);
      if (!dims[0]) return res.json({ error: 'p_dim1 required' }, 400);
      const queries = buildQueries(p);
      const docs = await fetchAll(endpoint, queries);
      const map = new Map();
      for (const r of docs) {
        const k = [r[dims[0]]||'', dims[1]?(r[dims[1]]||''):null, dims[2]?(r[dims[2]]||''):null, dims[3]?(r[dims[3]]||''):null, r.ano_referencia].join('||');
        const e = map.get(k) || { d1: r[dims[0]]||'', d2: dims[1]?(r[dims[1]]||''):null, d3: dims[2]?(r[dims[2]]||''):null, d4: dims[3]?(r[dims[3]]||''):null, ano_referencia: r.ano_referencia, empenhado: 0, liquidado: 0, pago_total: 0 };
        e.empenhado += N(r.empenhado); e.liquidado += N(r.liquidado); e.pago_total += N(r.pago_total);
        map.set(k, e);
      }
      return res.json(Array.from(map.values()).map(e => ({ ...e, empenhado: Math.round(e.empenhado*100)/100, liquidado: Math.round(e.liquidado*100)/100, pago_total: Math.round(e.pago_total*100)/100 })), 200);
    }

    // ── DELETE YEAR ──
    if (action === 'delete_year') {
      const ano = Number(p.p_ano);
      if (!ano) return res.json({ error: 'p_ano required' }, 400);
      const eqQ = qEq('ano_referencia', [ano]);
      let deleted = 0;
      while (true) {
        const r = await awGet(endpoint, `/databases/${DB_ID}/collections/${COLL}/documents?${buildQS([eqQ, `limit(5000)`])}`);
        const docs = (r.data && r.data.documents) || [];
        if (!docs.length) break;
        await Promise.all(docs.map(d => awReq(endpoint, 'DELETE', `/databases/${DB_ID}/collections/${COLL}/documents/${d.$id}`, null)));
        deleted += docs.length;
        if (docs.length < 5000) break;
      }
      const keys = [`dashboard_${ano}`, `map_${ano}`, `distincts_${ano}`];
      await Promise.all(keys.map(k => awReq(endpoint, 'DELETE', `/databases/${DB_ID}/collections/${CACHE}/documents/${k}`, null).catch(() => {})));
      return res.json({ deleted, ano }, 200);
    }

    // ── CLEANUP (cache rebuild for one year) ──
    if (action === 'cleanup') {
      const ano = Number(p.p_ano);
      if (!ano) return res.json({ error: 'p_ano required for cleanup in function context' }, 400);
      const docs = await fetchAll(endpoint, [qEq('ano_referencia', [ano])]);
      await awUpsert(endpoint, `dashboard_${ano}`, computeDashboard(docs));
      await awUpsert(endpoint, `map_${ano}`, computeMap(docs));
      await awUpsert(endpoint, `distincts_${ano}`, computeDistincts(docs));
      return res.json({ ok: true, registros: docs.length, ano }, 200);
    }

    return res.json({ error: 'Unknown action: ' + action }, 400);
  } catch (err) {
    return res.json({ error: err.message, action }, 500);
  }
};

'use strict';
const https = require('https');

const DB_ID   = '69ea274b00316d3d1dfb';
const COLL    = 'lc131_despesas';
const CACHE   = 'cache';
const LIMIT   = 5000;

// ── Query helpers ──
function qEq(field, vals) {
  const a = Array.isArray(vals) ? vals : [vals];
  const v = a.map(x => typeof x === 'number' ? String(x) : `"${String(x).replace(/"/g,'\\\"')}"`).join(',');
  return `equal("${field}",[${v}])`;
}
function buildQS(queries) {
  return queries.map(q => 'queries[]=' + encodeURIComponent(q)).join('&');
}

// ── Appwrite HTTP ──
function awGet(endpoint, path) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint + path);
    const opts = {
      hostname: url.hostname, path: url.pathname + url.search, method: 'GET',
      headers: {
        'X-Appwrite-Project': process.env.APPWRITE_FUNCTION_PROJECT_ID,
        'X-Appwrite-Key': process.env.APPWRITE_API_KEY,
        'Content-Type': 'application/json',
      },
    };
    const req = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } });
    });
    req.on('error', reject); req.end();
  });
}

async function fetchAll(endpoint, extraQueries) {
  const docs = [];
  let offset = 0;
  while (true) {
    const q = [...extraQueries, `limit(${LIMIT})`, ...(offset > 0 ? [`offset(${offset})`] : [])];
    const r = await awGet(endpoint, `/databases/${DB_ID}/collections/${COLL}/documents?${buildQS(q)}`);
    if (!r.documents) break;
    docs.push(...r.documents);
    if (r.documents.length < LIMIT) break;
    offset += LIMIT;
  }
  return docs;
}

// ── Aggregation ──
const N = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

function grpField(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = r[key] || '';
    if (!k) continue;
    const e = m.get(k) || { [key]: k, empenhado: 0, liquidado: 0, pago: 0, pago_total: 0, municipios: new Set(), registros: 0 };
    e.empenhado += N(r.empenhado); e.liquidado += N(r.liquidado);
    e.pago += N(r.pago); e.pago_total += N(r.pago_total);
    e.municipios.add(r.municipio || ''); e.registros++;
    m.set(k, e);
  }
  return Array.from(m.values()).map(e => ({
    [key]: e[key],
    empenhado: Math.round(e.empenhado * 100) / 100,
    liquidado: Math.round(e.liquidado * 100) / 100,
    pago: Math.round(e.pago * 100) / 100,
    pago_total: Math.round(e.pago_total * 100) / 100,
    municipios: e.municipios.size, registros: e.registros,
  })).sort((a, b) => b.empenhado - a.empenhado);
}

function grpSimple(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = r[key] || '';
    if (!k) continue;
    const e = m.get(k) || { [key]: k, empenhado: 0, liquidado: 0, pago: 0, pago_total: 0 };
    e.empenhado += N(r.empenhado); e.liquidado += N(r.liquidado);
    e.pago += N(r.pago); e.pago_total += N(r.pago_total);
    m.set(k, e);
  }
  return Array.from(m.values()).map(e => ({
    [key]: e[key],
    empenhado: Math.round(e.empenhado * 100) / 100,
    liquidado: Math.round(e.liquidado * 100) / 100,
    pago: Math.round(e.pago * 100) / 100,
    pago_total: Math.round(e.pago_total * 100) / 100,
  })).sort((a, b) => b.empenhado - a.empenhado);
}

function aggregate(docs) {
  const kpis = { empenhado: 0, liquidado: 0, pago: 0, pago_total: 0, total: docs.length, municipios: 0 };
  const munics = new Set();
  for (const r of docs) {
    kpis.empenhado += N(r.empenhado); kpis.liquidado += N(r.liquidado);
    kpis.pago += N(r.pago); kpis.pago_total += N(r.pago_total);
    munics.add(r.municipio || '');
  }
  kpis.municipios = munics.size;
  kpis.empenhado = Math.round(kpis.empenhado * 100) / 100;
  kpis.liquidado = Math.round(kpis.liquidado * 100) / 100;
  kpis.pago = Math.round(kpis.pago * 100) / 100;
  kpis.pago_total = Math.round(kpis.pago_total * 100) / 100;

  // por_ano (keyed as `ano`)
  const anoMap = new Map();
  for (const r of docs) {
    const k = r.ano_referencia;
    const e = anoMap.get(k) || { ano: k, empenhado: 0, liquidado: 0, pago: 0, pago_total: 0, registros: 0 };
    e.empenhado += N(r.empenhado); e.liquidado += N(r.liquidado);
    e.pago += N(r.pago); e.pago_total += N(r.pago_total); e.registros++;
    anoMap.set(k, e);
  }
  const por_ano = Array.from(anoMap.values()).map(e => ({
    ano: e.ano,
    empenhado: Math.round(e.empenhado * 100) / 100,
    liquidado: Math.round(e.liquidado * 100) / 100,
    pago: Math.round(e.pago * 100) / 100,
    pago_total: Math.round(e.pago_total * 100) / 100,
    registros: e.registros,
  })).sort((a, b) => a.ano - b.ano);

  // Favorecidos (top 50)
  const favMap = new Map();
  for (const r of docs) {
    const k = r.codigo_nome_favorecido || '';
    if (!k) continue;
    const e = favMap.get(k) || { favorecido: k, empenhado: 0, pago_total: 0, contratos: 0 };
    e.empenhado += N(r.empenhado); e.pago_total += N(r.pago_total); e.contratos++;
    favMap.set(k, e);
  }
  const por_favorecido = Array.from(favMap.values())
    .map(e => ({ ...e, empenhado: Math.round(e.empenhado * 100) / 100, pago_total: Math.round(e.pago_total * 100) / 100 }))
    .sort((a, b) => b.empenhado - a.empenhado).slice(0, 50);

  // por_projeto (projeto = codigo_nome_projeto_atividade)
  const projMap = new Map();
  for (const r of docs) {
    const k = r.codigo_nome_projeto_atividade || '';
    if (!k) continue;
    const e = projMap.get(k) || { projeto: k, empenhado: 0, pago_total: 0, registros: 0 };
    e.empenhado += N(r.empenhado); e.pago_total += N(r.pago_total); e.registros++;
    projMap.set(k, e);
  }
  const por_projeto = Array.from(projMap.values())
    .map(e => ({ ...e, empenhado: Math.round(e.empenhado * 100) / 100, pago_total: Math.round(e.pago_total * 100) / 100 }))
    .sort((a, b) => b.empenhado - a.empenhado).slice(0, 50);

  // por_ug (unidade gestora)
  const ugMap = new Map();
  for (const r of docs) {
    const k = r.codigo_nome_ug || r.codigo_ug || '';
    if (!k) continue;
    const e = ugMap.get(k) || { ug: k, empenhado: 0, pago_total: 0 };
    e.empenhado += N(r.empenhado); e.pago_total += N(r.pago_total);
    ugMap.set(k, e);
  }
  const por_ug = Array.from(ugMap.values())
    .map(e => ({ ...e, empenhado: Math.round(e.empenhado * 100) / 100, pago_total: Math.round(e.pago_total * 100) / 100 }))
    .sort((a, b) => b.empenhado - a.empenhado).slice(0, 100);

  // por_uo (unidade orçamentária)
  const uoMap = new Map();
  for (const r of docs) {
    const k = r.codigo_nome_uo || '';
    if (!k) continue;
    const e = uoMap.get(k) || { uo: k, empenhado: 0, liquidado: 0, pago_total: 0 };
    e.empenhado += N(r.empenhado); e.liquidado += N(r.liquidado); e.pago_total += N(r.pago_total);
    uoMap.set(k, e);
  }
  const por_uo = Array.from(uoMap.values())
    .map(e => ({ ...e, empenhado: Math.round(e.empenhado * 100) / 100, liquidado: Math.round(e.liquidado * 100) / 100, pago_total: Math.round(e.pago_total * 100) / 100 }))
    .sort((a, b) => b.empenhado - a.empenhado).slice(0, 100);

  // por_fonte (full fonte_recurso string)
  const fonteMap = new Map();
  for (const r of docs) {
    const k = r.codigo_nome_fonte_recurso || r.fonte_recurso || '';
    if (!k) continue;
    const e = fonteMap.get(k) || { fonte_recurso: k, empenhado: 0, pago_total: 0 };
    e.empenhado += N(r.empenhado); e.pago_total += N(r.pago_total);
    fonteMap.set(k, e);
  }
  const por_fonte = Array.from(fonteMap.values())
    .map(e => ({ ...e, empenhado: Math.round(e.empenhado * 100) / 100, pago_total: Math.round(e.pago_total * 100) / 100 }))
    .sort((a, b) => b.empenhado - a.empenhado);

  // por_municipio
  const municMap = new Map();
  for (const r of docs) {
    const k = r.municipio || '';
    if (!k) continue;
    const e = municMap.get(k) || { municipio: k, empenhado: 0, pago_total: 0 };
    e.empenhado += N(r.empenhado); e.pago_total += N(r.pago_total);
    municMap.set(k, e);
  }
  const por_municipio = Array.from(municMap.values())
    .map(e => ({ ...e, empenhado: Math.round(e.empenhado * 100) / 100, pago_total: Math.round(e.pago_total * 100) / 100 }))
    .sort((a, b) => b.empenhado - a.empenhado);

  // por_elemento
  const elemMap = new Map();
  for (const r of docs) {
    const k = r.codigo_nome_elemento || '';
    if (!k) continue;
    const e = elemMap.get(k) || { elemento: k, empenhado: 0, pago_total: 0 };
    e.empenhado += N(r.empenhado); e.pago_total += N(r.pago_total);
    elemMap.set(k, e);
  }
  const por_elemento = Array.from(elemMap.values())
    .map(e => ({ ...e, empenhado: Math.round(e.empenhado * 100) / 100, pago_total: Math.round(e.pago_total * 100) / 100 }))
    .sort((a, b) => b.empenhado - a.empenhado);

  return {
    kpis,
    por_ano,
    por_drs:         grpField(docs, 'drs'),
    por_rras:        grpField(docs, 'rras'),
    por_regiao_ad:   grpField(docs, 'regiao_ad'),
    por_regiao_sa:   grpField(docs, 'regiao_sa'),
    por_grupo:       grpField(docs, 'grupo_despesa'),
    por_grupo_simpl: grpSimple(docs, 'grupo_simpl'),
    por_fonte_simpl: grpSimple(docs, 'fonte_simpl'),
    por_tipo_despesa: grpSimple(docs, 'tipo_despesa'),
    por_rotulo:      grpSimple(docs, 'rotulo'),
    por_favorecido,
    por_projeto,
    por_ug,
    por_uo,
    por_fonte,
    por_municipio,
    por_elemento,
  };
}

// ── Filter helpers ──
const PARAM_TO_COL = {
  p_drs: 'drs', p_regiao_ad: 'regiao_ad', p_rras: 'rras', p_regiao_sa: 'regiao_sa',
  p_municipio: 'municipio', p_grupo_despesa: 'codigo_nome_grupo', p_tipo_despesa: 'tipo_despesa',
  p_rotulo: 'rotulo', p_uo: 'codigo_nome_uo', p_elemento: 'codigo_nome_elemento',
  p_favorecido: 'codigo_nome_favorecido', p_codigo_ug: 'codigo_ug',
  p_fonte_recurso: 'fonte_simpl', // fonte_simpl stores FEDERAL/ESTADUAL
};

function buildQueries(p) {
  const q = [];
  if (p.p_ano) q.push(qEq('ano_referencia', [Number(p.p_ano)]));
  for (const [param, col] of Object.entries(PARAM_TO_COL)) {
    const val = p[param];
    if (!val) continue;
    const vals = String(val).split('|').filter(Boolean);
    if (vals.length > 0) q.push(qEq(col, vals));
  }
  return q;
}

// ── Main handler ──
module.exports = async function(req, res) {
  try {
    const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
    const p = req.body || {};

    const queries = buildQueries(p);
    const hasFilters = queries.length > (p.p_ano ? 1 : 0);

    // Fast path: check cache for no-filter (p_ano only) queries
    if (!hasFilters) {
      const cacheId = p.p_ano ? `dashboard_${p.p_ano}` : 'dashboard_todos';
      const cached = await awGet(endpoint, `/databases/${DB_ID}/collections/${CACHE}/documents/${cacheId}`);
      if (cached && cached.data) {
        try {
          const result = JSON.parse(cached.data);
          return res.json(result, 200);
        } catch { /* cache parse error, fall through */ }
      }
    }

    // Aggregate from raw data
    const docs = await fetchAll(endpoint, queries);
    const result = aggregate(docs);
    return res.json(result, 200);
  } catch (err) {
    return res.json({ error: err.message }, 500);
  }
};

