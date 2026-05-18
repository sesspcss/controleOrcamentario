process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https = require('https');

const PROJECT  = '69ea271e000d28e3afce';
const API_KEY  = 'standard_8834bd8610e14b14457c14af3d1ebaa4de0a89405faeb1186a02d517d251b31c125896555137773df5d8fc00f87bb0f67b032cdb5f2dea1b6d4841b9b0d46e8022df8202ccd30b5b9046bf190eb9f5c0e26501ffbc89527f94e8c95eb14c627af38568f0647b64973868741b16b8e2d0ac257b8b1a838600c24a7d6120edf204';

function postFn(body) {
  return new Promise(resolve => {
    const payload = JSON.stringify(body);
    const opts = {
      hostname: 'fra.cloud.appwrite.io', path: '/v1/functions', method: 'POST',
      headers: { 'X-Appwrite-Project': PROJECT, 'X-Appwrite-Key': API_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    };
    const req = https.request(opts, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => resolve({ status: r.statusCode, data: JSON.parse(d) }));
    });
    req.on('error', e => resolve({ status: 0, data: { message: e.message } }));
    req.write(payload); req.end();
  });
}

async function delFn(id) {
  return new Promise(resolve => {
    const opts = { hostname: 'fra.cloud.appwrite.io', path: `/v1/functions/${id}`, method: 'DELETE', headers: { 'X-Appwrite-Project': PROJECT, 'X-Appwrite-Key': API_KEY } };
    const req = https.request(opts, r => { r.on('data', () => {}); r.on('end', resolve); });
    req.on('error', resolve); req.end();
  });
}

const RUNTIMES = ['node-14.5', 'node-16.0', 'node-18.0', 'node-20.0', 'node-21.0', 'node-22.0', 'node-18', 'node-20', 'node-22'];

(async () => {
  const idx = Date.now() % 10000;
  for (const rt of RUNTIMES) {
    const fnId = 'rt' + idx;
    const r = await postFn({ functionId: fnId, name: 'rt-test', runtime: rt, execute: ['any'] });
    const msg = r.data.message || (r.status < 300 ? 'OK - CREATED' : '?');
    console.log(rt.padEnd(12), r.status, msg.slice(0, 70));
    if (r.status === 201 || r.status === 200) await delFn(fnId);
  }
})();
