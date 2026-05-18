# 🏗️ ARQUITETURA DA MIGRAÇÃO: Supabase → Appwrite

## Diagrama da Transição

```
┌─────────────────────────────────────────────────────────────────────┐
│  ANTES: Supabase (PostgreSQL)                                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  React App (App.tsx)                                               │
│       │                                                             │
│       └──→ supabase.ts (Client Supabase)                           │
│            │                                                        │
│            ├─→ .from('lc131_despesas').select()  [SQL]            │
│            ├─→ .from('lc131_despesas').insert()  [SQL]            │
│            └─→ .rpc('lc131_dashboard')           [SQL Function]   │
│                                                                     │
│  Database: PostgreSQL (teikzwrfsxjipxozzhbr.supabase.co)          │
│  ├─ Table: lc131_despesas      (30M+ registros)                   │
│  ├─ Table: bd_ref              (lookup)                            │
│  ├─ Table: tab_drs             (mapping)                           │
│  └─ Table: tab_rras            (mapping)                           │
│                                                                     │
│  RPCs SQL:                                                          │
│  ├─ lc131_dashboard            [SELECT + SUM/GROUP BY]            │
│  ├─ lc131_map_data             [SELECT + FILTER]                  │
│  ├─ lc131_delete_year          [DELETE]                           │
│  └─ ... (8 mais)               [Various]                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                            ⬇️ MIGRAÇÃO ⬇️
┌─────────────────────────────────────────────────────────────────────┐
│  DEPOIS: Appwrite (Cloud Backend)                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  React App (App.tsx) - SEM MUDANÇAS!                               │
│       │                                                             │
│       └──→ appwrite.ts (Client Appwrite com Wrapper)               │
│            │                                                        │
│            ├─→ from().select()     [REST API → listDocuments()]   │
│            ├─→ from().insert()     [REST API → createDocument()]  │
│            └─→ rpc()               [REST API → Functions]         │
│                                                                     │
│  Database: Appwrite Cloud (fra.cloud.appwrite.io)                 │
│  ├─ Collection: lc131_despesas      (30M+ documents)              │
│  ├─ Collection: bd_ref              (lookup)                       │
│  ├─ Collection: tab_drs             (mapping)                      │
│  └─ Collection: tab_rras            (mapping)                      │
│                                                                     │
│  Appwrite Functions (Node.js):                                      │
│  ├─ lc131-dashboard            [Query + Aggregate]                │
│  ├─ lc131-map-data             [Query + Filter]                   │
│  ├─ lc131-delete-year          [Delete Loop]                      │
│  └─ ... (TODO: implementar 6 mais)                                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Flow de Migração de Dados

```
┌──────────────────┐
│ Supabase         │ (Origem)
│ 30M+ registros   │
└────────┬─────────┘
         │ npm run migrate-supabase-to-appwrite
         │
         ├─→ Script: migrate-to-appwrite.ts
         │   ├─ Lê dados em chunks de 500 registros
         │   ├─ Transforma formato (id → $id)
         │   └─ Inserir no Appwrite em lotes
         │
         ├─→ Progresso:
         │   ├─ [========        ] 40% (12M registros)
         │   ├─ [==========      ] 60% (18M registros)
         │   └─ [==============  ] 95% (28.5M registros)
         │
         └─→ Resultado: migration-report.json
             ├─ Total migrado: 29.9M
             ├─ Total falho: 100
             └─ Tempo: 3h 45m
│
└──────────────────┐
   Appwrite        │ (Destino)
   29.9M documents │
└──────────────────┘
```

---

## Arquitetura de Funções

### Padrão de Appwrite Function

```javascript
// appwrite-functions/[nome]/index.js

module.exports = async function(req, res) {
  // 1. Inicializar cliente
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT)
    .setKey(process.env.APPWRITE_API_KEY);

  // 2. Buscar dados
  const databases = new Databases(client);
  const docs = await databases.listDocuments(
    process.env.APPWRITE_DATABASE,
    'collection',
    [Query.equal('field', value)]
  );

  // 3. Processar/Agregar
  const result = processData(docs);

  // 4. Retornar
  return res.json({
    success: true,
    data: result
  });
};
```

---

## Mapa de Mapeamento: Supabase → Appwrite

| Supabase | Appwrite | Equivalente |
|----------|----------|------------|
| Database | Database | ✅ database-69ea274b00316d3d1dfb |
| Table | Collection | ✅ lc131_despesas |
| Row | Document | ✅ documents |
| Column | Attribute | ✅ ano_referencia, municipio, etc |
| Primary Key (id) | $id | ✅ Mapeado automaticamente |
| SQL Query | Query[] | ✅ Query.equal(), Query.limit() |
| SQL Function (RPC) | Appwrite Function | ✅ Node.js endpoint |
| Index | Index | ✅ Criado manualmente |
| Row Level Security | Permissions | ⚠️ Diferente, mais simples |
| Triggers | N/A | ❌ Use Functions em vez |
| Views | N/A | ❌ Use Functions para agregações |

---

## Timeline de Setup

```
┌─────────────────────────────────────────────────────────────────────┐
│ Tempo    │ Atividade              │ Status       │ Responsável      │
├──────────┼────────────────────────┼──────────────┼──────────────────┤
│ Agora    │ Ler documentação        │ ✅ Feito     │ Você (lendo isto)│
│ 5 min    │ Preparar .env.local     │ ⏳ Próximo   │ Você             │
│ 10 min   │ npm install             │ ⏳ Próximo   │ Você             │
│ 20 min   │ Criar collections       │ ⏳ Próximo   │ Você (console)   │
│ 30 min   │ Deploy 3 funções        │ ⏳ Próximo   │ Você (console)   │
│ 5 min    │ Testar conexão          │ ⏳ Próximo   │ Você             │
│ 1-6h     │ Rodar migração dados    │ ⏳ Próximo   │ Script (auto)    │
│ 2 min    │ Atualizar App.tsx       │ ⏳ Próximo   │ Você (1 linha)   │
│ 30 min   │ Testar aplicação        │ ⏳ Próximo   │ Você             │
│ 10 min   │ Build & Deploy          │ ⏳ Próximo   │ Você             │
├──────────┼────────────────────────┼──────────────┼──────────────────┤
│ TOTAL    │ ~9 horas (maioria auto) │ 🟡 Em prep   │ Distribuído      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Arquivos criados no Projeto

```
controleOrcamento/
│
├─ src/
│  ├─ appwrite.ts ⭐ NOVO
│  │  └─ Client + wrapper + rpc mapping
│  ├─ supabase.ts (antigo - manter por enquanto)
│  ├─ App.tsx (modificar 1 linha em Passo 6)
│  └─ ...
│
├─ scripts/
│  ├─ migrate-to-appwrite.ts ⭐ NOVO
│  │  └─ Lê Supabase, escreve Appwrite em lotes
│  └─ ... (outros scripts)
│
├─ appwrite-functions/ ⭐ NOVO
│  ├─ lc131-dashboard/
│  │  └─ index.js (implementado)
│  ├─ lc131-map-data/
│  │  └─ index.js (implementado)
│  ├─ lc131-delete-year/
│  │  └─ index.js (implementado)
│  ├─ lc131-pivot-multi/
│  │  └─ (TODO)
│  ├─ get-lc131-id-range/
│  │  └─ (TODO)
│  ├─ fix-tipo-despesa-by-year/
│  │  └─ (TODO)
│  ├─ post-import-cleanup/
│  │  └─ (TODO)
│  ├─ refresh-dashboard-batch/
│  │  └─ (TODO)
│  ├─ refresh-bdref-lookup/
│  │  └─ (TODO)
│  └─ DEPLOYMENT.md (guia de deploy)
│
├─ .env.example (atualizado)
├─ .env.local ⭐ NOVO (NÃO COMMITAR)
├─ package.json (atualizado com Appwrite + script)
│
├─ SETUP.md ⭐ NOVO (LEIA ISTO!)
├─ MIGRATION_GUIDE.md ⭐ NOVO
├─ RESUMO.md ⭐ NOVO (em português)
└─ ...
```

---

## Stack Comparativo

### Antes (Supabase)
```
┌─────────────────────┐
│  React + TypeScript │
├─────────────────────┤
│  Supabase JS SDK    │
├─────────────────────┤
│  PostgreSQL (SQL)   │
└─────────────────────┘
```

### Depois (Appwrite)
```
┌─────────────────────┐
│  React + TypeScript │
├─────────────────────┤
│  Appwrite SDK       │
├─────────────────────┤
│  Appwrite Cloud     │
│  ├─ Collections     │
│  └─ Functions (Node)│
└─────────────────────┘
```

---

## Checklist Final

```
ANTES DE COMEÇAR:
[ ] Leia RESUMO.md (5 min)
[ ] Leia SETUP.md (10 min)
[ ] Tem acesso ao console Appwrite?
[ ] Tem as credenciais Appwrite prontas?

DURANTE SETUP:
[ ] npm install
[ ] cp .env.example .env.local
[ ] Preencha .env.local com credenciais
[ ] Criar collections no console
[ ] Deploy das 3 funções
[ ] Testar conexão (npm run dev)

DURANTE MIGRAÇÃO:
[ ] npm run migrate-supabase-to-appwrite
[ ] NÃO interrompa (pode levar horas)
[ ] Monitore migration-report.json
[ ] Valide dados no console Appwrite

APÓS MIGRAÇÃO:
[ ] Trocar import em App.tsx (1 linha)
[ ] npm run dev
[ ] Testar dashboard completo
[ ] Testar filtros/agregações
[ ] Testar upload de arquivos
[ ] npm run build
[ ] Deploy em produção
```

---

**Criado em**: 2026-05-18
**Versão**: 1.0
**Status**: 🟡 Pronto para Execução
