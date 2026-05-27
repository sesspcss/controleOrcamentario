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
function buildQS(queries) {
  return queries.map((q, i) => `queries%5B${i}%5D=${encodeURIComponent(q)}`).join('&');
}

function awGet(endpoint, path) {
  return new Promise((resolve) => {
    const url = new URL(endpoint + path);
    const opts = {
      hostname: url.hostname, path: url.pathname + url.search, method: 'GET',
      headers: {
        'X-Appwrite-Project': process.env.APPWRITE_FUNCTION_PROJECT_ID,
        'X-Appwrite-Key': process.env.APPWRITE_API_KEY,
        'X-Appwrite-Response-Format': '1.4.0',
        'Content-Type': 'application/json',
      },
    };
    const req = https.request(opts, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } });
    });
    req.on('error', () => resolve({})); req.end();
  });
}

function awWrite(endpoint, method, path, body) {
  return new Promise((resolve) => {
    const url = new URL(endpoint + path);
    const payload = JSON.stringify(body);
    const opts = {
      hostname: url.hostname, path: url.pathname + url.search, method,
      headers: {
        'X-Appwrite-Project': process.env.APPWRITE_FUNCTION_PROJECT_ID,
        'X-Appwrite-Key': process.env.APPWRITE_API_KEY,
        'X-Appwrite-Response-Format': '1.4.0',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };
    const req = https.request(opts, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { resolve({ status: r.statusCode }); } catch { resolve({ status: 0 }); } });
    });
    req.on('error', () => resolve({ status: 0 }));
    req.write(payload); req.end();
  });
}

async function awUpsertCache(endpoint, cacheId, data) {
  const attrs = { data: JSON.stringify(data), cache_key: cacheId, updated_at: new Date().toISOString() };
  const upd = await awWrite(endpoint, 'PATCH', `/databases/${DB_ID}/collections/${CACHE}/documents/${cacheId}`, { data: attrs });
  if (upd.status !== 200) {
    await awWrite(endpoint, 'POST', `/databases/${DB_ID}/collections/${CACHE}/documents`, { documentId: cacheId, data: attrs });
  }
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

function mergeMapCaches(maps) {
  const R = v => Math.round(v * 100) / 100;
  const kpis = { empenhado: 0, liquidado: 0, pago: 0, pago_total: 0, registros: 0, municipios: 0, drs_count: 0 };
  for (const m of maps) {
    kpis.empenhado += N(m.kpis?.empenhado || 0);
    kpis.liquidado += N(m.kpis?.liquidado || 0);
    kpis.pago += N(m.kpis?.pago || 0);
    kpis.pago_total += N(m.kpis?.pago_total || 0);
    kpis.registros += N(m.kpis?.registros || 0);
  }
  function mergeRegion(key) {
    const m = new Map();
    const fieldKey = key.replace('por_', '');
    for (const map of maps) {
      for (const item of (map[key] || [])) {
        const k = item[fieldKey] || ''; if (!k) continue;
        const e = m.get(k) || { empenhado: 0, liquidado: 0, pago: 0, pago_total: 0, municipios: 0, registros: 0 };
        e.empenhado += N(item.empenhado || 0); e.liquidado += N(item.liquidado || 0);
        e.pago += N(item.pago || 0); e.pago_total += N(item.pago_total || 0);
        e.municipios += N(item.municipios || 0); e.registros += N(item.registros || 0);
        m.set(k, e);
      }
    }
    return Array.from(m.entries()).map(([k, e]) => ({
      [fieldKey]: k, empenhado: R(e.empenhado), liquidado: R(e.liquidado), pago: R(e.pago), pago_total: R(e.pago_total),
      municipios: e.municipios, registros: e.registros,
    })).sort((a, b) => b.empenhado - a.empenhado);
  }
  const municMap = new Map();
  for (const map of maps) {
    for (const munic of (map.municipios || [])) {
      const k = munic.municipio; if (!k) continue;
      const e = municMap.get(k) || { municipio: k, drs: munic.drs||'', rras: munic.rras||'', regiao_ad: munic.regiao_ad||'', regiao_sa: munic.regiao_sa||'', empenhado: 0, liquidado: 0, pago: 0, pago_total: 0, registros: 0 };
      e.empenhado += N(munic.empenhado || 0); e.liquidado += N(munic.liquidado || 0);
      e.pago += N(munic.pago || 0); e.pago_total += N(munic.pago_total || 0); e.registros += N(munic.registros || 0);
      municMap.set(k, e);
    }
  }
  const municipios = Array.from(municMap.values()).map(e => ({ ...e, empenhado: R(e.empenhado), liquidado: R(e.liquidado), pago: R(e.pago), pago_total: R(e.pago_total) }));
  kpis.municipios = municMap.size;
  kpis.drs_count = mergeRegion('por_drs').length;
  kpis.empenhado = R(kpis.empenhado); kpis.liquidado = R(kpis.liquidado);
  kpis.pago = R(kpis.pago); kpis.pago_total = R(kpis.pago_total);
  return {
    kpis,
    por_drs: mergeRegion('por_drs'),
    por_rras: mergeRegion('por_rras'),
    por_regiao_ad: mergeRegion('por_regiao_ad'),
    por_regiao_sa: mergeRegion('por_regiao_sa'),
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

    // Try cache (only for simple queries without extra filters)
    const isSimple = !p.p_drs && !p.p_rras && !p.p_regiao_ad && !p.p_regiao_sa && !p.p_municipio;
    if (isSimple) {
      const cacheId = p.p_ano ? `map_${p.p_ano}` : 'map_todos';
      const cached = await awGet(endpoint, `/databases/${DB_ID}/collections/${CACHE}/documents/${cacheId}`);
      if (cached && cached.data) {
        try { return res.json(JSON.parse(cached.data), 200); } catch { /* fall through */ }
      }
      // For todos: aggregate per-year caches instead of fetching all docs (would timeout)
      if (!p.p_ano) {
        const YEARS = [2022, 2023, 2024, 2025, 2026];
        const yearCaches = await Promise.all(
          YEARS.map(y => awGet(endpoint, `/databases/${DB_ID}/collections/${CACHE}/documents/map_${y}`).catch(() => null))
        );
        const validMaps = yearCaches.map(c => {
          if (!c || !c.data) return null;
          try { return JSON.parse(c.data); } catch { return null; }
        }).filter(Boolean);
        context.log(`todos merge: ${validMaps.length}/${YEARS.length} year caches found`);
        if (validMaps.length > 0) {
          const merged = mergeMapCaches(validMaps);
          awUpsertCache(endpoint, 'map_todos', merged).catch(() => {});
          return res.json(merged, 200);
        }
      }
    }

    const docs = await fetchAll(endpoint, queries);
    return res.json(aggregateMap(docs), 200);
  } catch (err) {
    context.error(err.message);
    return res.json({ error: err.message }, 500);
  }
};