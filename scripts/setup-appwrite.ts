/**
 * Setup Completo: Cria Collections no Appwrite
 * 
 * Uso: tsx scripts/setup-appwrite.ts
 * 
 * Este script:
 * 1. Conecta ao Appwrite
 * 2. Cria as 4 collections
 * 3. Cria índices para performance
 * 4. Pronto para migração de dados
 */

import { Client, Databases } from 'appwrite';

// Configuração
const APPWRITE_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
const APPWRITE_PROJECT = '69ea271e000d28e3afce';
const APPWRITE_DATABASE = 'database-69ea274b00316d3d1dfb';
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY || 'standard_8834bd8610e14b14457c14af3d1ebaa4de0a89405faeb1186a02d517d251b31c125896555137773df5d8fc00f87bb0f67b032cdb5f2dea1b6d4841b9b0d46e8022df8202ccd30b5b9046bf190eb9f5c0e26501ffbc89527f94e8c95eb14c627af38568f0647b64973868741b16b8e2d0ac257b8b1a838600c24a7d6120edf204';

// Cliente Appwrite
const client = new Client();
client.setEndpoint(APPWRITE_ENDPOINT);
client.setProject(APPWRITE_PROJECT);
client.setKey(APPWRITE_API_KEY);

const databases = new Databases(client);

// ========== LOGGING ==========

function log(msg: string, type: 'INFO' | 'SUCCESS' | 'ERROR' | 'WARN' = 'INFO') {
  const icons = {
    INFO: 'ℹ️',
    SUCCESS: '✅',
    ERROR: '❌',
    WARN: '⚠️',
  };
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
  console.log(`[${timestamp}] ${icons[type]} ${msg}`);
}

// ========== CRIAÇÃO DE COLLECTIONS ==========

async function createCollections() {
  try {
    log('Criando collections...', 'INFO');

    // Dados simplificados - apenas criar as collections
    const collections = [
      'lc131_despesas',
      'bd_ref',
      'tab_drs',
      'tab_rras',
    ];

    for (const collName of collections) {
      try {
        log(`Criando collection ${collName}...`, 'INFO');
        
        const col = await databases.createCollection(
          APPWRITE_DATABASE,
          collName,
          collName
        );
        
        log(`Collection ${collName} criada!`, 'SUCCESS');
      } catch (err: any) {
        if (err.status === 409) {
          log(`Collection ${collName} já existe (pulando)`, 'WARN');
        } else {
          log(`Erro ao criar ${collName}: ${err.message}`, 'ERROR');
        }
      }
    }

  } catch (error: any) {
    log(`Erro: ${error.message}`, 'ERROR');
  }
}

// ========== EXECUÇÃO ==========

async function main() {
  try {
    log('🚀 Setup Appwrite iniciado...', 'INFO');
    log(`Endpoint: ${APPWRITE_ENDPOINT}`, 'INFO');
    log(`Project: ${APPWRITE_PROJECT}`, 'INFO');
    log(`Database: ${APPWRITE_DATABASE}`, 'INFO');
    log('', 'INFO');

    // Testar conexão
    log('🧪 Testando conexão...', 'INFO');
    try {
      await databases.listCollections(APPWRITE_DATABASE);
      log('✅ Conexão OK!', 'SUCCESS');
    } catch (err) {
      log('❌ Erro ao conectar. Verifique API_KEY e credenciais.', 'ERROR');
      process.exit(1);
    }
    
    log('', 'INFO');

    // Criar collections
    await createCollections();

    log('', 'INFO');
    log('✅ Setup concluído!', 'SUCCESS');
    log('', 'INFO');
    log('Próximos passos:', 'INFO');
    log('1. Fazer deploy das Appwrite Functions', 'INFO');
    log('2. npm run migrate-supabase-to-appwrite', 'INFO');
  } catch (error: any) {
    log(`Erro crítico: ${error.message}`, 'ERROR');
    process.exit(1);
  }
}

main();

// ========== LOGGING ==========

function log(msg: string, type: 'INFO' | 'SUCCESS' | 'ERROR' | 'WARN' = 'INFO') {
  const icons = {
    INFO: 'ℹ️',
    SUCCESS: '✅',
    ERROR: '❌',
    WARN: '⚠️',
  };
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
  console.log(`[${timestamp}] ${icons[type]} ${msg}`);
}

// ========== CRIAÇÃO DE COLLECTIONS ==========

async function createLc131Despesas() {
  try {
    log('Criando collection lc131_despesas...', 'INFO');

    const collection = await databases.createCollection(
      APPWRITE_DATABASE,
      'lc131_despesas',
      'lc131_despesas',
      ['role:all']  // Permissões públicas para leitura
    );

    log('Collection criada com sucesso!', 'SUCCESS');

    // Criar atributos
    const attributes = [
      { name: 'ano_referencia', type: 'integer', required: false },
      { name: 'nome_municipio', type: 'string', size: 255, required: false },
      { name: 'codigo_ug', type: 'string', size: 100, required: false },
      { name: 'codigo_projeto_atividade', type: 'string', size: 100, required: false },
      { name: 'empenhado', type: 'float', required: false },
      { name: 'liquidado', type: 'float', required: false },
      { name: 'pago_total', type: 'float', required: false },
      { name: 'drs', type: 'string', size: 100, required: false },
      { name: 'rras', type: 'string', size: 100, required: false },
      { name: 'regiao_ad', type: 'string', size: 100, required: false },
      { name: 'municipio', type: 'string', size: 100, required: false },
      { name: 'tipo_despesa', type: 'string', size: 255, required: false },
      { name: 'rotulo', type: 'string', size: 255, required: false },
      { name: 'fonte_recurso', type: 'string', size: 100, required: false },
      { name: 'grupo_despesa', type: 'string', size: 100, required: false },
    ];

    for (const attr of attributes) {
      try {
        log(`  → Adicionando atributo: ${attr.name}`, 'INFO');
        
        const payload: any = {
          key: attr.name,
          type: attr.type,
          required: attr.required,
        };

        if (attr.type === 'string') {
          payload.size = attr.size;
        }

        await (databases as any).createStringAttribute(
          APPWRITE_DATABASE,
          'lc131_despesas',
          attr.name,
          attr.size || 255,
          attr.required
        );
      } catch (err: any) {
        if (err.code === 409) {
          log(`  → Atributo ${attr.name} já existe (pulando)`, 'WARN');
        } else {
          log(`  → Erro ao criar ${attr.name}: ${err.message}`, 'ERROR');
        }
      }
    }

    // Criar índices
    log('Criando índices...', 'INFO');
    const indexes = [
      { name: 'idx_ano', keys: ['ano_referencia'] },
      { name: 'idx_drs', keys: ['drs'] },
      { name: 'idx_municipio', keys: ['municipio'] },
      { name: 'idx_tipo_despesa', keys: ['tipo_despesa'] },
      { name: 'idx_ano_drs', keys: ['ano_referencia', 'drs'] },
    ];

    for (const idx of indexes) {
      try {
        log(`  → Criando índice: ${idx.name}`, 'INFO');
        await (databases as any).createIndex(
          APPWRITE_DATABASE,
          'lc131_despesas',
          idx.name,
          'key',
          idx.keys,
          ['DESC']
        );
      } catch (err: any) {
        if (err.code === 409) {
          log(`  → Índice ${idx.name} já existe (pulando)`, 'WARN');
        } else {
          log(`  → Erro ao criar índice ${idx.name}: ${err.message}`, 'WARN');
        }
      }
    }

    log('Collection lc131_despesas configurada!', 'SUCCESS');
  } catch (error: any) {
    if (error.code === 409) {
      log('Collection lc131_despesas já existe (pulando)', 'WARN');
    } else {
      log(`Erro ao criar lc131_despesas: ${error.message}`, 'ERROR');
    }
  }
}

async function createBdRef() {
  try {
    log('Criando collection bd_ref...', 'INFO');

    await databases.createCollection(
      APPWRITE_DATABASE,
      'bd_ref',
      'bd_ref',
      ['role:all']
    );

    log('Collection bd_ref criada!', 'SUCCESS');
  } catch (error: any) {
    if (error.code === 409) {
      log('Collection bd_ref já existe (pulando)', 'WARN');
    } else {
      log(`Erro ao criar bd_ref: ${error.message}`, 'ERROR');
    }
  }
}

async function createTabDrs() {
  try {
    log('Criando collection tab_drs...', 'INFO');

    await databases.createCollection(
      APPWRITE_DATABASE,
      'tab_drs',
      'tab_drs',
      ['role:all']
    );

    log('Collection tab_drs criada!', 'SUCCESS');
  } catch (error: any) {
    if (error.code === 409) {
      log('Collection tab_drs já existe (pulando)', 'WARN');
    } else {
      log(`Erro ao criar tab_drs: ${error.message}`, 'ERROR');
    }
  }
}

async function createTabRras() {
  try {
    log('Criando collection tab_rras...', 'INFO');

    await databases.createCollection(
      APPWRITE_DATABASE,
      'tab_rras',
      'tab_rras',
      ['role:all']
    );

    log('Collection tab_rras criada!', 'SUCCESS');
  } catch (error: any) {
    if (error.code === 409) {
      log('Collection tab_rras já existe (pulando)', 'WARN');
    } else {
      log(`Erro ao criar tab_rras: ${error.message}`, 'ERROR');
    }
  }
}

// ========== EXECUÇÃO ==========

async function main() {
  try {
    log('🚀 Iniciando setup do Appwrite...', 'INFO');
    log(`Endpoint: ${APPWRITE_ENDPOINT}`, 'INFO');
    log(`Project: ${APPWRITE_PROJECT}`, 'INFO');
    log(`Database: ${APPWRITE_DATABASE}`, 'INFO');
    log('', 'INFO');

    // Testar conexão
    log('🧪 Testando conexão...', 'INFO');
    await databases.listCollections(APPWRITE_DATABASE);
    log('Conexão OK!', 'SUCCESS');
    log('', 'INFO');

    // Criar collections
    log('📦 Criando collections...', 'INFO');
    await createLc131Despesas();
    await createBdRef();
    await createTabDrs();
    await createTabRras();

    log('', 'INFO');
    log('✅ Setup concluído com sucesso!', 'SUCCESS');
    log('', 'INFO');
    log('Próximos passos:', 'INFO');
    log('1. Deploy das Appwrite Functions (via console)', 'INFO');
    log('2. npm run migrate-supabase-to-appwrite', 'INFO');
    log('3. Atualizar App.tsx (trocar import de supabase)', 'INFO');
  } catch (error: any) {
    log(`Erro crítico: ${error.message}`, 'ERROR');
    process.exit(1);
  }
}

main();
