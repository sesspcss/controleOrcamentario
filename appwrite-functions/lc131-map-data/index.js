/**
 * Appwrite Function: lc131-map-data
 * Retorna dados para o mapa (por município, DRS, RRAS, regiões).
 * Lê do cache quando disponível (sem filtros), senão agrega dos documentos.
 */
'use strict';
const https = require('https');

const DB_ID = '69ea274b00316d3d1dfb';
const COLL  = 'lc131_despesas';
const CACHE = 'cache';
const LIMIT = 5000;

function qEq(field, vals) {
  const a = Array.isArray(vals) ? vals : [vals];
  const v = a.map(x => typeof x === 'number' ? String(x) : `"${String(x).replace(/"/g,'\\\"')}"`).join(',');
  return `equal("${field}",[${v}])`;
}
function buildQS(queries) { return queries.map(q => 'queries[]=' + encodeURIComponent(q)).join('&'); }

function awGet(endpoint, path) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint + path);
    const opts = {
      hostname: url.hostname, path: url.pathname + url.search, method: 'GET',
      headers: {
        'X-Appwrite-Project': process.env.APPWRITE_FUNCTION_PROJECT_ID,
        'X-Appwrite-Key': process.env.APPWRITE_API_KEY,
      },
    };
    const req = https.request(opts, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } });
    });
    req.on('error', reject); req.end();
  });
}

async function fetchAll(endpoint, extraQ) {
  const docs = []; let offset = 0;
  while (true) {
    const q = [...extraQ, `limit(${LIMIT})`, ...(offset > 0 ? [`offset(${offset})`] : [])];
    const r = await awGet(endpoint, `/databases/${DB_ID}/collections/${COLL}/documents?${buildQS(q)}`);
    if (!r.documents) break;
    docs.push(...r.documents);
    if (r.documents.length < LIMIT) break;
    offset += LIMIT;
  }
  return docs;
}

const N = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

function aggregateMap(docs) {
  const kpis = { empenhado: 0, liquidado: 0, pago: 0, pago_total: 0, registros: docs.length, municipios: 0, drs_count: 0 };
  const allMunic = new Set(), allDrs = new Set();
  for (const r of docs) {
    kpis.empenhado += N(r.empenhado); kpis.liquidado += N(r.liquidado);
    kpis.pago += N(r.pago); kpis.pago_total += N(r.pago_total);
    allMunic.add(r.municipio || ''); if (r.drs) allDrs.add(r.drs);
  }
  kpis.municipios = allMunic.size; kpis.drs_count = allDrs.size;
  kpis.empenhado = Math.round(kpis.empenhado * 100) / 100;
  kpis.liquidado = Math.round(kpis.liquidado * 100) / 100;
  kpis.pago = Math.round(kpis.pago * 100) / 100;
  kpis.pago_total = Math.round(kpis.pago_total * 100) / 100;

  function grpRegion(key) {
    const m = new Map();
    for (const r of docs) {
      const k = r[key] || ''; if (!k) continue;
      const e = m.get(k) || { [key]: k, empenhado: 0, liquidado: 0, pago: 0, pago_total: 0, municipios: new Set(), registros: 0 };
      e.empenhado += N(r.empenhado); e.liquidado += N(r.liquidado);
      e.pago += N(r.pago); e.pago_total += N(r.pago_total);
      e.municipios.add(r.municipio || ''); e.registros++; m.set(k, e);
    }
    return Array.from(m.values()).map(e => ({
      [key]: e[key], empenhado: Math.round(e.empenhado*100)/100, liquidado: Math.round(e.liquidado*100)/100,
      pago: Math.round(e.pago*100)/100, pago_total: Math.round(e.pago_total*100)/100,
      municipios: e.municipios.size, registros: e.registros,
    }));
  }

  const municMap = new Map();
  for (const r of docs) {
    const k = r.municipio || ''; if (!k) continue;
    const e = municMap.get(k) || { municipio: k, drs: r.drs||'', rras: r.rras||'', regiao_ad: r.regiao_ad||'', regiao_sa: r.regiao_sa||'', empenhado: 0, liquidado: 0, pago: 0, pago_total: 0, registros: 0 };
    e.empenhado += N(r.empenhado); e.liquidado += N(r.liquidado);
    e.pago += N(r.pago); e.pago_total += N(r.pago_total); e.registros++;
    municMap.set(k, e);
  }
  const municipios = Array.from(municMap.values()).map(e => ({
    ...e, empenhado: Math.round(e.empenhado*100)/100, liquidado: Math.round(e.liquidado*100)/100,
    pago: Math.round(e.pago*100)/100, pago_total: Math.round(e.pago_total*100)/100,
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

module.exports = async function(context) {
  const { req, res } = context;
  try {
    const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
    let p = {};
    try { p = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch { p = {}; }
    const queries = p.p_ano ? [qEq('ano_referencia', [Number(p.p_ano)])] : [];

    // Try cache (only for p_ano-only queries)
    if (!p.p_drs && !p.p_rras && !p.p_regiao_ad && !p.p_regiao_sa && !p.p_municipio) {
      const cacheId = p.p_ano ? `map_${p.p_ano}` : 'map_todos';
      const cached = await awGet(endpoint, `/databases/${DB_ID}/collections/${CACHE}/documents/${cacheId}`);
      context.log(`cache fetch: status=${cached?.code||'ok'} hasData=${!!cached?.data} dataLen=${cached?.data?.length||0}`);
      if (cached && cached.data) {
        try {
          const parsed = JSON.parse(cached.data);
          context.log(`cache hit: registros=${parsed.kpis?.registros}`);
          return res.json(parsed, 200);
        } catch (pe) {
          context.log(`cache parse error: ${pe.message}`);
          /* fall through */
        }
      }
    }

    context.log(`fetching fresh: queries=${JSON.stringify(queries)}`);
    const docs = await fetchAll(endpoint, queries);
    context.log(`fetched: ${docs.length} docs`);
    return res.json(aggregateMap(docs), 200);
  } catch (err) {
    context.error(err.message);
    return res.json({ error: err.message }, 500);
  }
};