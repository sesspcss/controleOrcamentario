/**
 * Script de Migração: Supabase → Appwrite
 * 
 * Uso: tsx scripts/migrate-to-appwrite.ts
 * 
 * Este script:
 * 1. Lê todos os dados do Supabase
 * 2. Transforma os dados para o formato do Appwrite
 * 3. Insere em lotes no Appwrite
 * 4. Valida a migração
 */

import { createClient } from '@supabase/supabase-js';
import { Client, Databases } from 'appwrite';
import * as fs from 'fs';

// ========== CONFIGURAÇÃO ==========

// Supabase (origem)
const SUPABASE_URL = 'https://teikzwrfsxjipxozzhbr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlaWt6d3Jmc3hqaXB4b3p6aGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3ODkwNDQsImV4cCI6MjA5MTM2NTA0NH0.t3tWIh3F9lmg-a6zzdmoKpupHB9i7hTfvFmPyFbZNZs';

// Appwrite (destino)
const APPWRITE_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
const APPWRITE_PROJECT = '69ea271e000d28e3afce';
const APPWRITE_DATABASE = '69ea274b00316d3d1dfb';
const APPWRITE_API_KEY = 'standard_8834bd8610e14b14457c14af3d1ebaa4de0a89405faeb1186a02d517d251b31c125896555137773df5d8fc00f87bb0f67b032cdb5f2dea1b6d4841b9b0d46e8022df8202ccd30b5b9046bf190eb9f5c0e26501ffbc89527f94e8c95eb14c627af38568f0647b64973868741b16b8e2d0ac257b8b1a838600c24a7d6120edf204';

const COLLECTIONS = {
  LC131_DESPESAS: 'lc131_despesas',
  BD_REF: 'bd_ref',
  TAB_DRS: 'tab_drs',
  TAB_RRAS: 'tab_rras',
};

// ========== INICIALIZAÇÃO ==========

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const appwriteClient = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT)
  .setKey(APPWRITE_API_KEY);

const appwriteDb = new Databases(appwriteClient);

// ========== UTILITÁRIOS ==========

interface MigrationStats {
  table: string;
  totalRecords: number;
  migratedRecords: number;
  failedRecords: number;
  startTime: Date;
  endTime?: Date;
  errors: string[];
}

const stats: Record<string, MigrationStats> = {};

function log(msg: string, level: 'INFO' | 'WARN' | 'ERROR' = 'INFO') {
  const timestamp = new Date().toISOString();
  const prefix = level === 'ERROR' ? '❌' : level === 'WARN' ? '⚠️' : 'ℹ️';
  console.log(`[${timestamp}] ${prefix} ${msg}`);
}

async function migrateTable(
  tableName: string,
  collectionId: string,
  transformFn?: (row: any) => any
) {
  const statsEntry: MigrationStats = {
    table: tableName,
    totalRecords: 0,
    migratedRecords: 0,
    failedRecords: 0,
    startTime: new Date(),
    errors: [],
  };

  stats[tableName] = statsEntry;

  try {
    log(`🔄 Iniciando migração de ${tableName}...`);

    // 1. Contar registros no Supabase
    const { count, error: countErr } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });

    if (countErr) throw new Error(`Erro ao contar ${tableName}: ${countErr.message}`);

    statsEntry.totalRecords = count || 0;
    log(`📊 Total de registros em ${tableName}: ${statsEntry.totalRecords}`);

    // 2. Limpar collection no Appwrite
    log(`🗑️  Limpando collection ${collectionId}...`);
    try {
      const existing = await appwriteDb.listDocuments(
        APPWRITE_DATABASE,
        collectionId,
        [{ method: 'limit', values: [1000] }]
      );

      for (const doc of existing.documents) {
        await appwriteDb.deleteDocument(APPWRITE_DATABASE, collectionId, doc.$id);
      }
    } catch (e) {
      log(`Aviso: não foi possível limpar collection (pode estar vazia)`, 'WARN');
    }

    // 3. Migrar em lotes
    const BATCH_SIZE = 500;
    let offset = 0;

    while (offset < statsEntry.totalRecords) {
      try {
        log(`📥 Buscando registros ${offset}-${offset + BATCH_SIZE}...`);

        const { data, error: fetchErr } = await supabase
          .from(tableName)
          .select('*')
          .range(offset, offset + BATCH_SIZE - 1);

        if (fetchErr) throw fetchErr;

        if (!data || data.length === 0) break;

        // 4. Transformar e inserir
        for (const row of data) {
          try {
            const doc = transformFn ? transformFn(row) : row;
            
            // Mapear 'id' para '$id' se não existir
            const docId = doc.$id || (doc.id ? String(doc.id) : 'unique()');
            if (doc.id) delete doc.id; // Remove 'id' duplicado

            await appwriteDb.createDocument(
              APPWRITE_DATABASE,
              collectionId,
              docId,
              doc
            );

            statsEntry.migratedRecords++;
          } catch (err: any) {
            statsEntry.failedRecords++;
            const errMsg = `Linha ${offset + data.indexOf(row)}: ${err.message}`;
            statsEntry.errors.push(errMsg);
            log(errMsg, 'ERROR');
          }
        }

        offset += BATCH_SIZE;
        log(`✅ ${statsEntry.migratedRecords}/${statsEntry.totalRecords} registros migrados`);
      } catch (err: any) {
        log(`Erro ao processar batch: ${err.message}`, 'ERROR');
        statsEntry.failedRecords += BATCH_SIZE;
      }
    }

    statsEntry.endTime = new Date();
    const duration = statsEntry.endTime.getTime() - statsEntry.startTime.getTime();
    log(`✅ Migração de ${tableName} concluída em ${(duration / 1000).toFixed(2)}s`);
  } catch (error: any) {
    log(`❌ Erro crítico ao migrar ${tableName}: ${error.message}`, 'ERROR');
    statsEntry.endTime = new Date();
  }
}

// ========== EXECUÇÃO PRINCIPAL ==========

async function main() {
  log('🚀 Iniciando migração Supabase → Appwrite');

  try {
    // Testar conexões
    log('🧪 Testando conexões...');
    
    const { data: sbTest, error: sbErr } = await supabase
      .from(COLLECTIONS.LC131_DESPESAS)
      .select('1')
      .limit(1);
    
    if (sbErr) throw new Error(`Erro ao conectar Supabase: ${sbErr.message}`);
    log('✅ Supabase conectado');

    try {
      await appwriteDb.listDatabases();
      log('✅ Appwrite conectado');
    } catch (err: any) {
      throw new Error(`Erro ao conectar Appwrite: ${err.message}`);
    }

    // Migrar tabelas
    log('📦 Começando migração das tabelas...\n');

    // 1. lc131_despesas (tabela principal)
    await migrateTable(
      COLLECTIONS.LC131_DESPESAS,
      COLLECTIONS.LC131_DESPESAS,
      (row) => ({
        ...row,
        $id: String(row.id),
      })
    );

    // 2. bd_ref (tabela de referência)
    await migrateTable(
      COLLECTIONS.BD_REF,
      COLLECTIONS.BD_REF,
      (row) => ({
        ...row,
        $id: String(row.codigo) || 'unique()',
      })
    );

    // 3. tab_drs
    await migrateTable(
      COLLECTIONS.TAB_DRS,
      COLLECTIONS.TAB_DRS,
      (row) => ({
        ...row,
        $id: String(row.municipio),
      })
    );

    // 4. tab_rras
    await migrateTable(
      COLLECTIONS.TAB_RRAS,
      COLLECTIONS.TAB_RRAS,
      (row) => ({
        ...row,
        $id: String(row.municipio),
      })
    );

    // ========== RELATÓRIO FINAL ==========
    log('\n📋 RELATÓRIO DE MIGRAÇÃO\n');
    
    let totalMigrated = 0;
    let totalFailed = 0;

    for (const [table, stat] of Object.entries(stats)) {
      const percent = stat.totalRecords > 0 
        ? ((stat.migratedRecords / stat.totalRecords) * 100).toFixed(1)
        : '0';
      
      totalMigrated += stat.migratedRecords;
      totalFailed += stat.failedRecords;

      console.log(`
├─ ${table}
│  ├─ Total: ${stat.totalRecords}
│  ├─ Migrados: ${stat.migratedRecords} (${percent}%)
│  ├─ Falhos: ${stat.failedRecords}
│  └─ Duração: ${stat.endTime ? ((stat.endTime.getTime() - stat.startTime.getTime()) / 1000).toFixed(2) + 's' : 'N/A'}
      `);

      if (stat.errors.length > 0) {
        log(`\nErros em ${table}:`, 'WARN');
        stat.errors.slice(0, 5).forEach(err => log(`  - ${err}`, 'WARN'));
        if (stat.errors.length > 5) {
          log(`  ... e mais ${stat.errors.length - 5} erros`, 'WARN');
        }
      }
    }

    console.log(`
═══════════════════════════════
TOTAL MIGRADO: ${totalMigrated}
TOTAL FALHO: ${totalFailed}
═══════════════════════════════
    `);

    // Salvar relatório
    const reportPath = 'migration-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(stats, null, 2));
    log(`\n📄 Relatório salvo em: ${reportPath}`);

    log('\n✅ Migração concluída!');
  } catch (error: any) {
    log(`❌ Erro crítico: ${error.message}`, 'ERROR');
    process.exit(1);
  }
}

main().catch(err => {
  log(`Erro não tratado: ${err.message}`, 'ERROR');
  process.exit(1);
});
