/**
 * Appwrite Function: lc131-delete-year
 * Deleta todos os documentos de um ano especifico e limpa o cache.
 */
'use strict';
const https = require('https');

const DB_ID = '69ea274b00316d3d1dfb';
const COLL  = 'lc131_despesas';

function awReq(endpoint, method, path, body) {
  return new Promise(function(resolve, reject) {
    const url = new URL(endpoint + path);
    const payload = body ? JSON.stringify(body) : undefined;
    const headers = {
      'X-Appwrite-Project': process.env.APPWRITE_FUNCTION_PROJECT_ID,
      'X-Appwrite-Key': process.env.APPWRITE_API_KEY,
      'Content-Type': 'application/json',
    };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    const opts = { hostname: url.hostname, path: url.pathname + url.search, method: method, headers: headers };
    const req = https.request(opts, function(r) {
      let d = '';
      r.on('data', function(c) { d += c; });
      r.on('end', function() {
        try { resolve({ status: r.statusCode, data: JSON.parse(d) }); }
        catch(e) { resolve({ status: r.statusCode }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

module.exports = async function(req, res) {
  try {
    const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT || 'https://fra.cloud.appwrite.io/v1';
    const p = req.body || {};
    const ano = Number(p.p_ano);
    if (!ano) return res.json({ error: 'p_ano required' }, 400);

    const eqQ  = 'equal("ano_referencia",[' + ano + '])';
    const limQ = 'limit(5000)';
    const listQS = 'queries[]=' + encodeURIComponent(eqQ) + '&queries[]=' + encodeURIComponent(limQ);

    let deleted = 0;
    while (true) {
      const r = await awReq(endpoint, 'GET',
        '/databases/' + DB_ID + '/collections/' + COLL + '/documents?' + listQS,
        undefined
      );
      const docs = (r.data && r.data.documents) ? r.data.documents : [];
      if (!docs.length) break;
      await Promise.all(docs.map(function(d) {
        return awReq(endpoint, 'DELETE',
          '/databases/' + DB_ID + '/collections/' + COLL + '/documents/' + d.$id,
          undefined
        );
      }));
      deleted += docs.length;
      if (docs.length < 5000) break;
    }

    const cacheKeys = ['dashboard_' + ano, 'map_' + ano, 'distincts_' + ano];
    await Promise.all(cacheKeys.map(function(k) {
      return awReq(endpoint, 'DELETE',
        '/databases/' + DB_ID + '/collections/cache/documents/' + k,
        undefined
      ).catch(function() {});
    }));

    return res.json({ deleted: deleted, ano: ano }, 200);
  } catch (err) {
    return res.json({ error: err.message }, 500);
  }
};
