/**
 * Appwrite Function: lc131-pivot-multi
 * Pivot multi-nivel: agrega lc131_despesas por ate 4 dimensoes.
 * Params: p_dim1..p_dim4, p_ano, + filtros
 */
'use strict';
const https = require('https');

const DB_ID = '69ea274b00316d3d1dfb';
const COLL  = 'lc131_despesas';
const LIMIT = 5000;

const DIM_TO_COL = {
  drs: 'drs', rras: 'rras', regiao_ad: 'regiao_ad', regiao_sa: 'regiao_sa',
  municipio: 'municipio', grupo_simpl: 'grupo_simpl', fonte_simpl: 'fonte_simpl',
  tipo_despesa: 'tipo_despesa', rotulo: 'rotulo', ano_referencia: 'ano_referencia',
  grupo_despesa: 'grupo_despesa', codigo_nome_uo: 'codigo_nome_uo',
  codigo_nome_elemento: 'codigo_nome_elemento',
};

const PARAM_TO_COL = {
  p_drs: 'drs', p_regiao_ad: 'regiao_ad', p_rras: 'rras', p_regiao_sa: 'regiao_sa',
  p_municipio: 'municipio', p_grupo_despesa: 'codigo_nome_grupo', p_tipo_despesa: 'tipo_despesa',
  p_rotulo: 'rotulo', p_uo: 'codigo_nome_uo', p_elemento: 'codigo_nome_elemento',
  p_favorecido: 'codigo_nome_favorecido', p_codigo_ug: 'codigo_ug',
  p_fonte_recurso: 'fonte_simpl',
};

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

const N = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

module.exports = async function(req, res) {
  try {
    const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
    const p = req.body || {};

    const dims = [p.p_dim1, p.p_dim2, p.p_dim3, p.p_dim4].map(d => DIM_TO_COL[d] || null);
    const d1col = dims[0];
    if (!d1col) return res.json({ error: 'p_dim1 required' }, 400);

    const queries = [];
    if (p.p_ano) queries.push(qEq('ano_referencia', [Number(p.p_ano)]));
    for (const [param, col] of Object.entries(PARAM_TO_COL)) {
      const val = p[param];
      if (!val) continue;
      const vals = String(val).split('|').filter(Boolean);
      if (vals.length > 0) queries.push(qEq(col, vals));
    }

    const docs = await fetchAll(endpoint, queries);

    const map = new Map();
    for (const r of docs) {
      const k = [
        r[d1col] || '',
        dims[1] ? (r[dims[1]] || '') : null,
        dims[2] ? (r[dims[2]] || '') : null,
        dims[3] ? (r[dims[3]] || '') : null,
        r.ano_referencia,
      ].join('||');
      const e = map.get(k) || { d1: r[d1col]||'', d2: dims[1] ? (r[dims[1]]||'') : null, d3: dims[2] ? (r[dims[2]]||'') : null, d4: dims[3] ? (r[dims[3]]||'') : null, ano_referencia: r.ano_referencia, empenhado: 0, liquidado: 0, pago_total: 0 };
      e.empenhado += N(r.empenhado); e.liquidado += N(r.liquidado); e.pago_total += N(r.pago_total);
      map.set(k, e);
    }

    const result = Array.from(map.values()).map(e => ({
      ...e,
      empenhado: Math.round(e.empenhado * 100) / 100,
      liquidado: Math.round(e.liquidado * 100) / 100,
      pago_total: Math.round(e.pago_total * 100) / 100,
    }));

    return res.json(result, 200);
  } catch (err) {
    return res.json({ error: err.message }, 500);
  }
};
