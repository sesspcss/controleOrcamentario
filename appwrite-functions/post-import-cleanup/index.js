/**
 * Appwrite Function: post-import-cleanup
 * Recomputa o cache para um ano (ou todos os anos) apos importacao de dados.
 * Params: { p_ano?: number }  — omitir p_ano para recomputar todos.
 */
'use strict';
const https = require('https');

const DB_ID   = '69ea274b00316d3d1dfb';
const COLL    = 'lc131_despesas';
const CACHE   = 'cache';
const LIMIT   = 5000;
const ANOS    = [2022, 2023, 2024, 2025, 2026];

const N = function(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

function awGet(endpoint, path) {
  return new Promise(function(resolve, reject) {
    const url = new URL(endpoint + path);
    const opts = {
      hostname: url.hostname, path: url.pathname + url.search, method: 'GET',
      headers: {
        'X-Appwrite-Project': process.env.APPWRITE_FUNCTION_PROJECT_ID,
        'X-Appwrite-Key': process.env.APPWRITE_API_KEY,
      },
    };
    const req = https.request(opts, function(r) {
      let d = '';
      r.on('data', function(c) { d += c; });
      r.on('end', function() { try { resolve(JSON.parse(d)); } catch(e) { resolve({}); } });
    });
    req.on('error', reject);
    req.end();
  });
}

function awUpsert(endpoint, collId, docId, data) {
  return new Promise(function(resolve, reject) {
    const payload = JSON.stringify({ data: JSON.stringify(data), cache_key: docId, updated_at: new Date().toISOString() });
    const tryCreate = function() {
      const url = new URL(endpoint + '/databases/' + DB_ID + '/collections/' + collId + '/documents');
      const opts = {
        hostname: url.hostname, path: url.pathname, method: 'POST',
        headers: {
          'X-Appwrite-Project': process.env.APPWRITE_FUNCTION_PROJECT_ID,
          'X-Appwrite-Key': process.env.APPWRITE_API_KEY,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      };
      const req = https.request(opts, function(r) {
        let d = '';
        r.on('data', function(c) { d += c; });
        r.on('end', function() {
          if (r.statusCode === 409) {
            tryUpdate();
          } else {
            try { resolve(JSON.parse(d)); } catch(e) { resolve({}); }
          }
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    };
    const tryUpdate = function() {
      const url = new URL(endpoint + '/databases/' + DB_ID + '/collections/' + collId + '/documents/' + docId);
      const opts = {
        hostname: url.hostname, path: url.pathname, method: 'PATCH',
        headers: {
          'X-Appwrite-Project': process.env.APPWRITE_FUNCTION_PROJECT_ID,
          'X-Appwrite-Key': process.env.APPWRITE_API_KEY,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      };
      const req = https.request(opts, function(r) {
        let d = '';
        r.on('data', function(c) { d += c; });
        r.on('end', function() { try { resolve(JSON.parse(d)); } catch(e) { resolve({}); } });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    };
    tryCreate();
  });
}

async function fetchAll(endpoint, extraQ) {
  const docs = [];
  let offset = 0;
  while (true) {
    const q = extraQ.slice();
    q.push('limit(' + LIMIT + ')');
    if (offset > 0) q.push('offset(' + offset + ')');
    const qs = q.map(function(s) { return 'queries[]=' + encodeURIComponent(s); }).join('&');
    const r = await awGet(endpoint, '/databases/' + DB_ID + '/collections/' + COLL + '/documents?' + qs);
    if (!r.documents) break;
    docs.push.apply(docs, r.documents);
    if (r.documents.length < LIMIT) break;
    offset += LIMIT;
  }
  return docs;
}

function computeDashboard(docs) {
  let emp = 0, liq = 0, pago = 0, pagoT = 0;
  const porAno = {}, porDrs = {}, porRras = {}, porRegiaoAd = {}, porRegiaoSa = {};
  const porGrupo = {}, porGrupoSimpl = {}, porFonte = {}, porTipo = {}, porRotulo = {};
  const porMunic = {}, porFav = {}, porProjeto = {}, porUg = {}, porUo = {}, porElem = {};
  const allMunic = new Set();

  for (const r of docs) {
    const e = N(r.empenhado), l = N(r.liquidado), p = N(r.pago), pt = N(r.pago_total);
    emp += e; liq += l; pago += p; pagoT += pt;
    if (r.municipio) allMunic.add(r.municipio);

    const ano = r.ano_referencia;
    if (ano) {
      if (!porAno[ano]) porAno[ano] = { ano: ano, empenhado: 0, liquidado: 0, pago: 0, pago_total: 0, registros: 0 };
      porAno[ano].empenhado += e; porAno[ano].liquidado += l; porAno[ano].pago += p; porAno[ano].pago_total += pt; porAno[ano].registros++;
    }

    function addTo(map, key, val) {
      if (!val) return;
      if (!map[val]) map[val] = { empenhado: 0, liquidado: 0, pago: 0, pago_total: 0, registros: 0 };
      map[val].empenhado += e; map[val].liquidado += l; map[val].pago += p; map[val].pago_total += pt; map[val].registros++;
    }
    addTo(porDrs, 'drs', r.drs); addTo(porRras, 'rras', r.rras);
    addTo(porRegiaoAd, 'regiao_ad', r.regiao_ad); addTo(porRegiaoSa, 'regiao_sa', r.regiao_sa);
    addTo(porGrupo, 'grupo', r.codigo_nome_grupo || r.grupo_despesa);
    addTo(porGrupoSimpl, 'grupo_simpl', r.grupo_simpl);
    addTo(porFonte, 'fonte', r.fonte_simpl);
    addTo(porTipo, 'tipo', r.tipo_despesa); addTo(porRotulo, 'rotulo', r.rotulo);
    addTo(porMunic, 'municipio', r.municipio); addTo(porFav, 'favorecido', r.codigo_nome_favorecido);
    addTo(porProjeto, 'projeto', r.rotulo); addTo(porUg, 'ug', r.codigo_ug);
    addTo(porUo, 'uo', r.codigo_nome_uo); addTo(porElem, 'elem', r.codigo_nome_elemento);
  }

  function mapToArr(map, nameKey) {
    return Object.entries(map).map(function(pair) {
      const k = pair[0], v = pair[1];
      const obj = {};
      obj[nameKey] = k;
      obj.empenhado = Math.round(v.empenhado*100)/100;
      obj.liquidado  = Math.round(v.liquidado*100)/100;
      obj.pago       = Math.round(v.pago*100)/100;
      obj.pago_total = Math.round(v.pago_total*100)/100;
      obj.registros  = v.registros;
      return obj;
    });
  }

  return {
    kpis: { empenhado: Math.round(emp*100)/100, liquidado: Math.round(liq*100)/100, pago: Math.round(pago*100)/100, pago_total: Math.round(pagoT*100)/100, registros: docs.length, municipios: allMunic.size },
    por_ano:         Object.values(porAno).map(function(v) { return { ano: v.ano, empenhado: Math.round(v.empenhado*100)/100, liquidado: Math.round(v.liquidado*100)/100, pago: Math.round(v.pago*100)/100, pago_total: Math.round(v.pago_total*100)/100, registros: v.registros }; }),
    por_drs:         mapToArr(porDrs, 'drs'),
    por_rras:        mapToArr(porRras, 'rras'),
    por_regiao_ad:   mapToArr(porRegiaoAd, 'regiao_ad'),
    por_regiao_sa:   mapToArr(porRegiaoSa, 'regiao_sa'),
    por_grupo:       mapToArr(porGrupo, 'grupo_despesa'),
    por_grupo_simpl: mapToArr(porGrupoSimpl, 'grupo_simpl'),
    por_fonte_simpl: mapToArr(porFonte, 'fonte_simpl'),
    por_tipo_despesa:mapToArr(porTipo, 'tipo_despesa'),
    por_rotulo:      mapToArr(porRotulo, 'rotulo'),
    por_favorecido:  mapToArr(porFav, 'codigo_nome_favorecido'),
    por_projeto:     mapToArr(porProjeto, 'rotulo'),
    por_ug:          mapToArr(porUg, 'codigo_ug'),
    por_uo:          mapToArr(porUo, 'codigo_nome_uo'),
    por_elemento:    mapToArr(porElem, 'codigo_nome_elemento'),
    por_municipio:   mapToArr(porMunic, 'municipio'),
  };
}

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
    return Object.entries(map).map(function(pair) {
      const k = pair[0], v = pair[1];
      const o = {}; o[nameKey] = k;
      o.empenhado = Math.round(v.empenhado*100)/100; o.liquidado = Math.round(v.liquidado*100)/100;
      o.pago = Math.round(v.pago*100)/100; o.pago_total = Math.round(v.pago_total*100)/100;
      o.municipios = v.municipios.size; o.registros = v.registros;
      return o;
    });
  }
  return {
    kpis: kpis,
    por_drs: regArr(drMap, 'drs'), por_rras: regArr(rrMap, 'rras'),
    por_regiao_ad: regArr(adMap, 'regiao_ad'), por_regiao_sa: regArr(saMap, 'regiao_sa'),
    municipios: Object.values(mMap).map(function(e) {
      return { municipio: e.municipio, drs: e.drs, rras: e.rras, regiao_ad: e.regiao_ad, regiao_sa: e.regiao_sa,
        empenhado: Math.round(e.empenhado*100)/100, liquidado: Math.round(e.liquidado*100)/100,
        pago: Math.round(e.pago*100)/100, pago_total: Math.round(e.pago_total*100)/100, registros: e.registros };
    }),
  };
}

function computeDistincts(docs) {
  const uniq = function(fn) { return Array.from(new Set(docs.map(fn).filter(Boolean))).sort(); };
  return {
    distinct_drs: uniq(function(r) { return r.drs; }),
    distinct_regiao_ad: uniq(function(r) { return r.regiao_ad; }),
    distinct_rras: uniq(function(r) { return r.rras; }),
    distinct_regiao_sa: uniq(function(r) { return r.regiao_sa; }),
    distinct_municipio: uniq(function(r) { return r.municipio; }),
    distinct_grupo: uniq(function(r) { return r.codigo_nome_grupo || r.grupo_despesa; }),
    distinct_tipo: uniq(function(r) { return r.tipo_despesa; }),
    distinct_rotulo: uniq(function(r) { return r.rotulo; }),
    distinct_fonte: uniq(function(r) { return r.fonte_simpl; }),
    distinct_codigo_ug: uniq(function(r) { return r.codigo_ug; }),
    distinct_uo: uniq(function(r) { return r.codigo_nome_uo; }),
    distinct_elemento: uniq(function(r) { return r.codigo_nome_elemento; }),
    distinct_favorecido: uniq(function(r) { return r.codigo_nome_favorecido; }),
  };
}

async function rebuildYear(endpoint, ano) {
  const eqQ = 'equal("ano_referencia",[' + ano + '])';
  const docs = await fetchAll(endpoint, [eqQ]);
  const dash = computeDashboard(docs);
  const map  = computeMap(docs);
  const dist = computeDistincts(docs);
  await awUpsert(endpoint, CACHE, 'dashboard_' + ano, dash);
  await awUpsert(endpoint, CACHE, 'map_' + ano, map);
  await awUpsert(endpoint, CACHE, 'distincts_' + ano, dist);
  return { dashboard: true, map: true, distincts: true, registros: docs.length };
}

module.exports = async function(req, res) {
  try {
    const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
    const p = req.body || {};
    const results = {};

    const anos = p.p_ano ? [Number(p.p_ano)] : ANOS;
    for (const ano of anos) {
      results[ano] = await rebuildYear(endpoint, ano);
    }

    if (!p.p_ano) {
      const allDocs = await fetchAll(endpoint, []);
      await awUpsert(endpoint, CACHE, 'dashboard_todos', computeDashboard(allDocs));
      await awUpsert(endpoint, CACHE, 'map_todos', computeMap(allDocs));
      await awUpsert(endpoint, CACHE, 'distincts_todos', computeDistincts(allDocs));
      results.todos = { registros: allDocs.length };
    }

    return res.json({ ok: true, results: results }, 200);
  } catch (err) {
    return res.json({ error: err.message }, 500);
  }
};
