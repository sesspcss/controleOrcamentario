process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https = require('https');
// Try listing existing functions to see runtime format used
const opts = {
  hostname: 'fra.cloud.appwrite.io',
  path: '/v1/functions',
  method: 'GET',
  headers: {
    'X-Appwrite-Project': '69ea271e000d28e3afce',
    'X-Appwrite-Key': 'standard_8834bd8610e14b14457c14af3d1ebaa4de0a89405faeb1186a02d517d251b31c125896555137773df5d8fc00f87bb0f67b032cdb5f2dea1b6d4841b9b0d46e8022df8202ccd30b5b9046bf190eb9f5c0e26501ffbc89527f94e8c95eb14c627af38568f0647b64973868741b16b8e2d0ac257b8b1a838600c24a7d6120edf204',
  },
};
const req = https.request(opts, r => {
  let d = '';
  r.on('data', c => d += c);
  r.on('end', () => {
    try {
      const j = JSON.parse(d);
      const fns = j.functions || [];
      if (fns.length) {
        console.log('Existing functions:');
        fns.forEach(f => console.log(' ', f.$id, '| runtime:', f.runtime));
      } else {
        console.log('No functions found. Raw:', d.slice(0, 500));
      }
    } catch(e) { console.log('Raw response:', d.slice(0, 500)); }
  });
});
req.on('error', e => console.error(e));
req.end();
