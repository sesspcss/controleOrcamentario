/**
 * Appwrite Function: lc131-dashboard
 * Agrega despesas LC131 para o painel. Lê da collection lc131_despesas via Appwrite API.
 * Env vars: APPWRITE_API_KEY, APPWRITE_FUNCTION_API_ENDPOINT, APPWRITE_FUNCTION_PROJECT_ID
 */
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

