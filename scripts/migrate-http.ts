/**
 * Migração: Supabase → Appwrite
 * Usa HTTP direto para evitar problemas de SDK
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import https from 'https';

// Configurações
const SUPABASE_URL = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODkwNDQsImV4cCI6MjA5MTM2NTA0NH0.t3tWIh3F9lmg-a6zzdmoKpupHB9i7hTfvFmPyFbZNZs';

const APPWRITE_ENDPOINT = 'fra.cloud.appwrite.io';
const APPWRITE_PROJECT = '69ea271e000d28e3afce';
const APPWRITE_DATABASE = '69ea274b00316d3d1dfb';
const APPWRITE_API_KEY = 'standard_8834bd8610e14b14457c14af3d1ebaa4de0a89405faeb1186a02d517d251b31c125896555137773df5d8fc00f87bb0f67b032cdb5f2dea1b6d4841b9b0d46e8022df8202ccd30b5b9046bf190eb9f5c0e26501ffbc89527f94e8c95eb14c627af38568f0647b64973868741b16b8e2d0ac257b8b1a838600c24a7d6120edf204';

const COLLECTIONS = {
  LC131_DESPESAS: 'lc131_despesas',
  BD_REF: 'bd_ref',
  TAB_DRS: 'tab_drs',
  TAB_RRAS: 'tab_rras',
};

// Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Estatísticas
const stats = {
  [COLLECTIONS.LC131_DESPESAS]: { total: 0, migrado: 0, erro: 0 },
  [COLLECTIONS.BD_REF]: { total: 0, migrado: 0, erro: 0 },
  [COLLECTIONS.TAB_DRS]: { total: 0, migrado: 0, erro: 0 },
  [COLLECTIONS.TAB_RRAS]: { total: 0, migrado: 0, erro: 0 },
};

// HTTP POST para Appwrite
function appwriteInsert(collectionId, document) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(document);

    const options = {
      hostname: APPWRITE_ENDPOINT,
      port: 443,
      path: `/v1/databases/${APPWRITE_DATABASE}/collections/${collectionId}/documents`,
      method: 'POST',
      rejectUnauthorized: false,
      headers: {
        'X-Appwrite-Project': APPWRITE_PROJECT,
        'X-Appwrite-Key': APPWRITE_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode === 201 || res.statusCode === 200) {
          resolve(true);
        } else {
          reject(new Error(`${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Transformar documento Supabase → Appwrite
function transformDocument(data) {
  const doc = { ...data };

  // Appwrite usa $id em vez de id
  if (doc.id) {
    doc.$id = String(doc.id);
    delete doc.id;
  }

  // Converter tipos se necessário
  for (const [key, value] of Object.entries(doc)) {
    if (value === null) {
      doc[key] = '';
    }
  }

  return doc;
}

// Migrar uma tabela
async function migrateTable(table, collectionId) {
  console.log(`\n📦 Migrando ${table}...`);

  let offset = 0;
  const batchSize = 100;
  let totalMigrado = 0;
  let totalErro = 0;

  try {
    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .range(offset, offset + batchSize - 1);

      if (error) {
        console.error(`   ❌ Erro ao ler ${table}:`, error.message);
        break;
      }

      if (!data || data.length === 0) {
        console.log(`   ✅ Concluído! Total: ${totalMigrado} registros migrados`);
        stats[collectionId].total = totalMigrado;
        stats[collectionId].migrado = totalMigrado;
        stats[collectionId].erro = totalErro;
        break;
      }

      // Migrar cada documento
      for (const doc of data) {
        try {
          const transformed = transformDocument(doc);
          await appwriteInsert(collectionId, transformed);
          totalMigrado++;
        } catch (e) {
          totalErro++;
          if (totalErro % 100 === 0) {
            console.log(`   ⚠️  Erros: ${totalErro}`);
          }
        }
      }

      offset += batchSize;

      if (totalMigrado % 500 === 0) {
        console.log(`   ⏳ ${totalMigrado} registros migrados...`);
      }
    }
  } catch (error) {
    console.error(`   ❌ Erro geral ao migrar ${table}:`, error.message);
  }
}

// Executar migração
async function main() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  MIGRAÇÃO SUPABASE → APPWRITE                 ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const startTime = Date.now();

  // Migrar cada tabela
  for (const [key, table] of Object.entries(COLLECTIONS)) {
    await migrateTable(table, table);
  }

  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);

  // Relatório final
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  MIGRAÇÃO COMPLETA!                           ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  console.log('📊 Estatísticas:');
  for (const [collection, data] of Object.entries(stats)) {
    console.log(`  ${collection}: ${data.migrado}/${data.total} (${data.erro} erros)`);
  }

  console.log(`\n⏱️  Tempo total: ${duration} minutos`);

  // Salvar relatório
  fs.writeFileSync('migration-report.json', JSON.stringify(stats, null, 2));
  console.log('\n📄 Relatório salvo em: migration-report.json\n');
}

main().catch((error) => {
  console.error('❌ Erro fatal:', error.message);
  process.exit(1);
});
