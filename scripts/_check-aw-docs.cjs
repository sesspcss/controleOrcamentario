process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https = require('https');
const AW_KEY = 'standard_8834bd8610e14b14457c14af3d1ebaa4de0a89405faeb1186a02d517d251b31c125896555137773df5d8fc00f87bb0f67b032cdb5f2dea1b6d4841b9b0d46e8022df8202ccd30b5b9046bf190eb9f5c0e26501ffbc89527f94e8c95eb14c627af38568f0647b64973868741b16b8e2d0ac257b8b1a838600c24a7d6120edf204';
const opts = {
  hostname: 'fra.cloud.appwrite.io',
  path: '/v1/databases/69ea274b00316d3d1dfb/collections/lc131_despesas/documents',
  method: 'GET',
  headers: { 'X-Appwrite-Project': '69ea271e000d28e3afce', 'X-Appwrite-Key': AW_KEY },
};
const req = https.request(opts, r => {
  let d = ''; r.on('data', c => d += c);
  r.on('end', () => {
    try {
      const j = JSON.parse(d);
      if (j.message) { console.log('ERROR:', j.message, '| code:', j.code); return; }
      console.log('total reported:', j.total);
      const anos = {};
      (j.documents||[]).forEach(d => { anos[d.ano_referencia] = (anos[d.ano_referencia]||0)+1; });
      console.log('Anos sample:', JSON.stringify(anos));
      if (j.documents && j.documents[0]) {
        const d0 = j.documents[0];
        console.log('First doc keys:', Object.keys(d0).filter(k => !k.startsWith('$')).join(','));
      }
    } catch(e) { console.log('Parse err:', e.message, d.slice(0,200)); }
  });
});
req.on('error', e => console.error(e));
req.end();
