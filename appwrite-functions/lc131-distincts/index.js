/**
 * Appwrite Function: lc131-distincts
 * Retorna valores distintos para os filtros do dashboard.
 * Usa cache quando disponível (sem filtros), senão agrega dos documentos.
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
function buildQS(q) { return q.map(s => 'queries[]=' + encodeURIComponent(s)).join('&'); }

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

const uniq = (arr, fn) => [...new Set(arr.map(fn || (x => x)).filter(Boolean))].sort();

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

function computeDistincts(docs) {
  return {
    distinct_drs:        uniq(docs, r => r.drs),
    distinct_regiao_ad:  uniq(docs, r => r.regiao_ad),
    distinct_rras:       uniq(docs, r => r.rras),
    distinct_regiao_sa:  uniq(docs, r => r.regiao_sa),
    distinct_municipio:  uniq(docs, r => r.municipio),
    distinct_grupo:      uniq(docs, r => r.codigo_nome_grupo || r.grupo_despesa),
    distinct_tipo:       uniq(docs, r => r.tipo_despesa),
    distinct_rotulo:     uniq(docs, r => r.rotulo),
    distinct_fonte:      uniq(docs, r => r.fonte_simpl),
    distinct_codigo_ug:  uniq(docs, r => r.codigo_ug),
    distinct_uo:         uniq(docs, r => r.codigo_nome_uo),
    distinct_elemento:   uniq(docs, r => r.codigo_nome_elemento),
    distinct_favorecido: uniq(docs, r => r.codigo_nome_favorecido),
  };
}

module.exports = async function(req, res) {
  try {
    const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
    const p = req.body || {};
    const queries = buildQueries(p);
    const hasFilters = queries.length > (p.p_ano ? 1 : 0);

    if (!hasFilters) {
      const cacheId = p.p_ano ? `distincts_${p.p_ano}` : 'distincts_todos';
      const cached = await awGet(endpoint, `/databases/${DB_ID}/collections/${CACHE}/documents/${cacheId}`);
      if (cached && cached.data) {
        try { return res.json(JSON.parse(cached.data), 200); } catch { /* fall through */ }
      }
    }

    const docs = await fetchAll(endpoint, queries);
    return res.json(computeDistincts(docs), 200);
  } catch (err) {
    return res.json({ error: err.message }, 500);
  }
};
