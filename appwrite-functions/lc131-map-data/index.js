/**
 * Appwrite Function: lc131-map-data
 * Proxy para Supabase RPC lc131_map_data
 */

const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://teikzwrfsxjipxozzhbr.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODkwNDQsImV4cCI6MjA5MTM2NTA0NH0.t3tWIh3F9lmg-a6zzdmoKpupHB9i7hTfvFmPyFbZNZs';

function callSupabaseRpc(functionName, params) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(params || {});
    const url = new URL(SUPABASE_URL + '/rest/v1/rpc/' + functionName);
    const opts = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

module.exports = async function(req, res) {
  try {
    const params = req.body || {};
    const result = await callSupabaseRpc('lc131_map_data', params);
    if (result.status >= 400) {
      return res.json({ error: result.body }, result.status);
    }
    return res.send(result.body, result.status, { 'Content-Type': 'application/json' });
  } catch (error) {
    console.error('Erro em lc131_map_data:', error);
    return res.json({ error: error.message }, 500);
  }
};