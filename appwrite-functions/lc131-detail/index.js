/**
 * Appwrite Function: lc131-detail
 * Retorna registros paginados de lc131_despesas com filtros.
 * Params: p_ano, p_offset, p_limit, p_search, + filtros do FILTER_TO_COL
 */
'use strict';
const https = require('https');

const DB_ID = '69ea274b00316d3d1dfb';
const COLL  = 'lc131_despesas';

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

const PARAM_TO_COL = {
  p_drs: 'drs', p_regiao_ad: 'regiao_ad', p_rras: 'rras', p_regiao_sa: 'regiao_sa',
  p_municipio: 'municipio', p_grupo_despesa: 'codigo_nome_grupo', p_tipo_despesa: 'tipo_despesa',
  p_rotulo: 'rotulo', p_uo: 'codigo_nome_uo', p_elemento: 'codigo_nome_elemento',
  p_favorecido: 'codigo_nome_favorecido', p_codigo_ug: 'codigo_ug',
  p_fonte_recurso: 'fonte_simpl',
};

module.exports = async function(req, res) {
  try {
    const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
    const p = req.body || {};
    const limit  = Math.min(Number(p.p_limit) || 500, 5000);
    const offset = Number(p.p_offset) || 0;

    const queries = ['orderDesc("empenhado")'];
    if (p.p_ano) queries.push(qEq('ano_referencia', [Number(p.p_ano)]));
    if (p.p_search) queries.push(qEq('codigo_ug', [String(p.p_search)]));

    for (const [param, col] of Object.entries(PARAM_TO_COL)) {
      const val = p[param];
      if (!val) continue;
      const vals = String(val).split('|').filter(Boolean);
      if (vals.length > 0) queries.push(qEq(col, vals));
    }

    queries.push(`limit(${limit})`);
    if (offset > 0) queries.push(`offset(${offset})`);

    const r = await awGet(endpoint, `/databases/${DB_ID}/collections/${COLL}/documents?${buildQS(queries)}`);
    return res.json({
      rows: (r.documents || []),
      total: r.total || 0,
    }, 200);
  } catch (err) {
    return res.json({ error: err.message }, 500);
  }
};
