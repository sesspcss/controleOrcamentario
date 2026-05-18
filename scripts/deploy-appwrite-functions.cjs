/**
 * deploy-appwrite-functions.cjs
 * Empacota e faz deploy de todas as Appwrite Functions.
 *
 * Para cada função:
 *  1. Cria (ou confirma que existe) a function entity no Appwrite
 *  2. Empacota o diretório como tar.gz
 *  3. Envia o deployment (multipart/form-data)
 *  4. Configura env vars (APPWRITE_API_KEY)
 *
 * Uso: node scripts/deploy-appwrite-functions.cjs
 */
'use strict';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const https  = require('https');
const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const { execSync } = require('child_process');
const os     = require('os');

const PROJECT_ID  = '69ea271e000d28e3afce';
const API_KEY     = 'standard_8834bd8610e14b14457c14af3d1ebaa4de0a89405faeb1186a02d517d251b31c125896555137773df5d8fc00f87bb0f67b032cdb5f2dea1b6d4841b9b0d46e8022df8202ccd30b5b9046bf190eb9f5c0e26501ffbc89527f94e8c95eb14c627af38568f0647b64973868741b16b8e2d0ac257b8b1a838600c24a7d6120edf204';
const AW_HOST     = 'fra.cloud.appwrite.io';
const AW_BASE     = '/v1';
const RUNTIME     = 'node-20.0';
const FUNC_DIR    = path.resolve(__dirname, '..', 'appwrite-functions');

const FUNCTIONS = [
  { id: 'lc131-dashboard',    name: 'LC131 Dashboard',    entrypoint: 'index.js' },
  { id: 'lc131-map-data',     name: 'LC131 Map Data',     entrypoint: 'index.js' },
  { id: 'lc131-distincts',    name: 'LC131 Distincts',    entrypoint: 'index.js' },
  { id: 'lc131-detail',       name: 'LC131 Detail',       entrypoint: 'index.js' },
  { id: 'lc131-pivot-multi',  name: 'LC131 Pivot Multi',  entrypoint: 'index.js' },
  { id: 'lc131-delete-year',  name: 'LC131 Delete Year',  entrypoint: 'index.js' },
  { id: 'post-import-cleanup',name: 'Post Import Cleanup',entrypoint: 'index.js' },
];

// ─── HTTP helpers ────────────────────────────────────────────────────────────
function awReq(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const opts = {
      hostname: AW_HOST, path: AW_BASE + path, method,
      headers: {
        'X-Appwrite-Project': PROJECT_ID,
        'X-Appwrite-Key': API_KEY,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = https.request(opts, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        try { resolve({ status: r.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ status: r.statusCode, data: d }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function awMultipart(method, urlPath, fields, fileField, fileName, fileBuffer) {
  return new Promise((resolve, reject) => {
    const boundary = '----AW' + Date.now().toString(36);
    const parts = [];
    for (const [k, v] of Object.entries(fields)) {
      parts.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`
      );
    }
    const fileHeader = `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${fileName}"\r\nContent-Type: application/gzip\r\n\r\n`;
    const fileFooter = `\r\n--${boundary}--\r\n`;
    const bodyParts = [Buffer.from(parts.join(''), 'utf8'), Buffer.from(fileHeader, 'utf8'), fileBuffer, Buffer.from(fileFooter, 'utf8')];
    const body = Buffer.concat(bodyParts);
    const opts = {
      hostname: AW_HOST, path: AW_BASE + urlPath, method,
      headers: {
        'X-Appwrite-Project': PROJECT_ID,
        'X-Appwrite-Key': API_KEY,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    };
    const req = https.request(opts, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        try { resolve({ status: r.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ status: r.statusCode, data: d }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Ensure function exists ───────────────────────────────────────────────────
async function ensureFunction(fn) {
  const get = await awReq('GET', `/functions/${fn.id}`, null);
  if (get.status === 200) {
    console.log(`  [✓] Function ${fn.id} already exists`);
    return;
  }
  const body = { functionId: fn.id, name: fn.name, runtime: RUNTIME, execute: ['any'], logging: true, timeout: 900 };
  const create = await awReq('POST', '/functions', body);
  if (create.status === 201 || create.status === 200) {
    console.log(`  [+] Created function ${fn.id}`);
  } else {
    throw new Error(`Failed to create ${fn.id}: ${JSON.stringify(create.data)}`);
  }
}

// ─── Set APPWRITE_API_KEY env var ────────────────────────────────────────────
async function setEnvVar(fnId, key, value) {
  // List existing vars first
  const list = await awReq('GET', `/functions/${fnId}/variables`, null);
  if (list.status === 200 && list.data.variables) {
    const existing = list.data.variables.find(v => v.key === key);
    if (existing) {
      const upd = await awReq('PUT', `/functions/${fnId}/variables/${existing.$id}`, { key, value });
      if (upd.status === 200) { console.log(`  [✓] Updated env ${key} on ${fnId}`); return; }
    }
  }
  const create = await awReq('POST', `/functions/${fnId}/variables`, { key, value });
  if (create.status === 201 || create.status === 200) {
    console.log(`  [+] Set env ${key} on ${fnId}`);
  } else {
    console.warn(`  [!] Could not set env ${key} on ${fnId}: ${JSON.stringify(create.data)}`);
  }
}

// ─── Package and deploy ───────────────────────────────────────────────────────
async function deployFunction(fn) {
  const srcDir  = path.join(FUNC_DIR, fn.id);
  const tmpFile = path.join(os.tmpdir(), fn.id + '.tar.gz');

  if (!fs.existsSync(srcDir)) {
    console.warn(`  [!] Directory not found: ${srcDir} — skipping`);
    return;
  }

  // Package with tar (available on Windows 10+ and in Git Bash)
  try {
    execSync(`tar -czf "${tmpFile}" -C "${srcDir}" .`, { stdio: 'inherit' });
  } catch (e) {
    // Try PowerShell Compress-Archive as fallback
    execSync(`powershell -Command "Compress-Archive -Path '${srcDir}\\*' -DestinationPath '${tmpFile.replace('.tar.gz', '.zip')}' -Force"`, { stdio: 'inherit' });
    console.warn(`  [!] Used ZIP fallback — Appwrite requires tar.gz. Please check.`);
    return;
  }

  const tarBuf = fs.readFileSync(tmpFile);
  const fields = { entrypoint: fn.entrypoint, activate: 'true' };

  console.log(`  Uploading ${fn.id} (${(tarBuf.length / 1024).toFixed(1)} KB)...`);
  const deploy = await awMultipart('POST', `/functions/${fn.id}/deployments`, fields, 'code', fn.id + '.tar.gz', tarBuf);
  fs.unlinkSync(tmpFile);

  if (deploy.status === 201 || deploy.status === 200) {
    console.log(`  [✓] Deployed ${fn.id} — deployment ${deploy.data.$id || '?'}`);
  } else {
    throw new Error(`Deploy failed for ${fn.id}: HTTP ${deploy.status} — ${JSON.stringify(deploy.data)}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Appwrite Functions Deploy ===\n');
  for (const fn of FUNCTIONS) {
    console.log(`→ ${fn.id}`);
    try {
      await ensureFunction(fn);
      await setEnvVar(fn.id, 'APPWRITE_API_KEY', API_KEY);
      await deployFunction(fn);
    } catch (e) {
      console.error(`  [✗] Error on ${fn.id}: ${e.message}`);
    }
    console.log('');
  }
  console.log('Done.');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
