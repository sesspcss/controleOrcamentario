# ✅ SETUP COMPLETO: Supabase → Appwrite

## 📋 O Que Foi Feito

### ✅ Fase 1: Preparação (COMPLETO)

- [x] Arquivo `src/appwrite.ts` - Cliente Appwrite com wrapper compatível com Supabase API
- [x] Arquivo `src/appwrite.ts` - APPWRITE_CONFIG com IDs de database/collections/functions
- [x] Atualizado `package.json` com dependências Appwrite
- [x] Criado script `scripts/migrate-to-appwrite.ts` - Migração de dados do Supabase
- [x] Criado documento `MIGRATION_GUIDE.md` - Guia completo de migração
- [x] Criadas 3 Appwrite Functions:
  - `appwrite-functions/lc131-dashboard/index.js`
  - `appwrite-functions/lc131-map-data/index.js`
  - `appwrite-functions/lc131-delete-year/index.js`
- [x] Criado `appwrite-functions/DEPLOYMENT.md` - Instruções de deploy

---

## 🔄 Próximos Passos (Para Você Fazer)

### PASSO 1️⃣: Preparar Ambiente Local

```bash
# 1a. Instalar dependências
npm install

# 1b. Criar .env.local (nunca commitar este arquivo!)
cat > .env.local << 'EOF'
VITE_APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT=69ea271e000d28e3afce
VITE_APPWRITE_DATABASE=database-69ea274b00316d3d1dfb
APPWRITE_API_KEY=standard_8834bd8610e14b14457c14af3d1ebaa4de0a89405faeb1186a02d517d251b31c125896555137773df5d8fc00f87bb0f67b032cdb5f2dea1b6d4841b9b0d46e8022df8202ccd30b5b9046bf190eb9f5c0e26501ffbc89527f94e8c95eb14c627af38568f0647b64973868741b16b8e2d0ac257b8b1a838600c24a7d6120edf204
EOF

# 1c. Adicionar .env.local ao .gitignore
echo ".env.local" >> .gitignore
```

---

### PASSO 2️⃣: Criar Collections no Appwrite

Acesse: https://cloud.appwrite.io/console/project-69ea271e000d28e3afce/databases/database-69ea274b00316d3d1dfb

#### Criar Collection: `lc131_despesas`

1. Clique "Create Collection"
2. Configure os atributos (alguns campos principais):

```
- id (String) - PK
- ano_referencia (Integer)
- nome_municipio (String)
- codigo_ug (String)
- codigo_projeto_atividade (String)
- empenhado (Float)
- liquidado (Float)
- pago_total (Float)
- drs (String)
- rras (String)
- regiao_ad (String)
- municipio (String)
- tipo_despesa (String)
- rotulo (String)
- fonte_recurso (String)
- grupo_despesa (String)
- ... (mais campos conforme necessário)
```

3. **Criar Índices** (para performance):
   - `ano_referencia`
   - `drs`
   - `municipio`
   - `tipo_despesa`

#### Criar Collection: `bd_ref`

```
- codigo (String) - PK
- unidade (String)
- drs (String)
- regiao_ad (String)
- ... (conforme schema original)
```

#### Criar Collection: `tab_drs`

```
- municipio (String) - PK
- drs (String)
```

#### Criar Collection: `tab_rras`

```
- municipio (String) - PK
- rras (String)
```

---

### PASSO 3️⃣: Deploy das Appwrite Functions

Acesse: https://cloud.appwrite.io/console/project-69ea271e000d28e3afce/functions

Para cada função em `appwrite-functions/`:

#### 3.1 - Função: `lc131-dashboard`

1. Clique "Create Function"
2. **Name**: `lc131-dashboard`
3. **Runtime**: Node.js 19.0
4. **Permissions**: Select "Any"
5. Cole o conteúdo de `appwrite-functions/lc131-dashboard/index.js`
6. Clique "Deploy"
7. Defina variáveis de ambiente:
   - `APPWRITE_ENDPOINT`: `https://fra.cloud.appwrite.io/v1`
   - `APPWRITE_PROJECT`: `69ea271e000d28e3afce`
   - `APPWRITE_DATABASE`: `database-69ea274b00316d3d1dfb`
   - `APPWRITE_API_KEY`: (sua API key com permissão de admin)

#### 3.2 - Função: `lc131-map-data`

Repita os passos acima com:
- **Name**: `lc131-map-data`
- Arquivo: `appwrite-functions/lc131-map-data/index.js`

#### 3.3 - Função: `lc131-delete-year`

Repita com:
- **Name**: `lc131-delete-year`
- Arquivo: `appwrite-functions/lc131-delete-year/index.js`

#### 🟡 Funções Ainda Não Implementadas (TODO)

Você vai precisar criar as seguintes funções (copie o padrão das 3 acima):
- `lc131-pivot-multi`
- `get-lc131-id-range`
- `fix-tipo-despesa-by-year`
- `post-import-cleanup`
- `refresh-dashboard-batch`
- `refresh-bdref-lookup`

---

### PASSO 4️⃣: Testar Conexão

```bash
# Abra o console do navegador (F12) na app em http://localhost:3000
# Cole e execute:

import { appwrite } from './src/appwrite.ts';

// Teste 1: Ler dados
const data = await appwrite.from('lc131_despesas').select('*').limit(5);
console.log('Teste 1 - Select:', data);

// Teste 2: Chamar RPC
const dashboard = await appwrite.rpc('lc131_dashboard', { p_ano: 2024 });
console.log('Teste 2 - Dashboard:', dashboard);
```

---

### PASSO 5️⃣: Migrar Dados do Supabase

```bash
# CUIDADO: Este comando vai deletar dados do Appwrite!
npm run migrate-supabase-to-appwrite

# Isto vai:
# 1. Ler TODOS os dados do Supabase (pode levar horas com >30M registros)
# 2. Inserir no Appwrite em lotes
# 3. Gerar relatório em migration-report.json
```

**Tempo estimado**: 
- 1-2 horas para 10M registros
- 4-6 horas para 30M+ registros

**Dica**: Se tiver muitos registros, considere:
- Migrar apenas alguns anos primeiro (2023-2025)
- Depois adicionar dados históricos (2022)

---

### PASSO 6️⃣: Atualizar App.tsx

Trocar import de Supabase para Appwrite:

**Encontre** (linha ~11):
```typescript
import { supabase } from './supabase';
```

**Troque por**:
```typescript
import { appwrite as supabase } from './appwrite'; // Usa compatibilidade de API
```

**Pronto!** O resto do App.tsx continua igual porque usamos um wrapper compatível.

---

### PASSO 7️⃣: Testar Aplicação

```bash
# Iniciar dev server
npm run dev

# Teste em http://localhost:3000:
# 1. Carrega os dados do dashboard?
# 2. Os filtros funcionam?
# 3. O mapa carrega?
# 4. Consegue fazer upload de arquivos?
```

---

### PASSO 8️⃣: Deploy para Produção

```bash
# Build
npm run build

# Testar build localmente
npm run preview

# Deploy (conforme seu host: Vercel, Netlify, etc.)
# Exemplo Vercel:
vercel deploy --prod

# NÃO ESQUECER: Adicionar variáveis de ambiente em produção
# - VITE_APPWRITE_ENDPOINT
# - VITE_APPWRITE_PROJECT
# - VITE_APPWRITE_DATABASE
```

---

## 📊 Estrutura de Arquivos Criados

```
controleOrcamento/
├── src/
│   ├── appwrite.ts ⭐ (Novo)
│   ├── supabase.ts (Antigo - pode manter ou remover)
│   └── App.tsx (Modificar import)
│
├── scripts/
│   ├── migrate-to-appwrite.ts ⭐ (Novo)
│   └── ... (outros scripts)
│
├── appwrite-functions/ ⭐ (Novo)
│   ├── lc131-dashboard/
│   │   └── index.js
│   ├── lc131-map-data/
│   │   └── index.js
│   ├── lc131-delete-year/
│   │   └── index.js
│   ├── DEPLOYMENT.md
│   └── ... (mais funções)
│
├── .env.local ⭐ (Novo - NÃO COMMITAR)
├── MIGRATION_GUIDE.md ⭐ (Novo)
├── SETUP.md ⭐ (Este arquivo)
├── package.json (Atualizado)
└── ...
```

---

## ⚠️ Pontos Importantes

### Antes de Começar
- [ ] Fazer backup do Supabase
- [ ] Verificar se tem espaço suficiente no Appwrite (free tier: 1GB)
- [ ] Testar em ambiente de staging antes de produção

### Durante a Migração
- [ ] **NÃO** deletar dados do Supabase ainda
- [ ] Validar que os dados foram migrados corretamente
- [ ] Testar todas as funcionalidades antes de remover Supabase

### Variáveis de Ambiente
- [ ] Nunca commitar `.env.local`
- [ ] Usar `.env.example` para documentar variáveis esperadas
- [ ] Em produção, usar secrets manager (Vercel, Netlify, etc.)

### Segurança
- [ ] Gerar nova API Key do Appwrite se a atual foi exposta
- [ ] Restringir permissões de collections (RLS)
- [ ] Usar autenticação para operações sensíveis

---

## 📞 Troubleshooting

### Erro: "Collection not found"
```
Solução: Verificar IDs em appwrite.ts:
- APPWRITE_CONFIG.DATABASE_ID
- APPWRITE_CONFIG.COLLECTIONS.LC131_DESPESAS
```

### Erro: "Documentos muito lentos para carregar"
```
Solução:
1. Criar índices nas collections
2. Reduzir tamanho do query
3. Usar paginação
4. Aumentar limits: Query.limit(1000)
```

### Erro: "Function timeout"
```
Solução:
1. Aumentar timeout da função (no console Appwrite)
2. Reduzir batch size
3. Implementar paginação
4. Considerar Cloud Run para funções pesadas
```

### Erro: "Quota exceeded"
```
Solução:
1. Upgrade do plano Appwrite
2. Implementar rate limiting
3. Usar caching
4. Distribuir carga
```

---

## 🎯 Resumo Rápido dos Comandos

```bash
# Setup inicial
npm install
echo ".env.local" >> .gitignore

# Desenvolvimento
npm run dev                              # http://localhost:3000

# Migração (só rodar UMA VEZ!)
npm run migrate-supabase-to-appwrite    # Lê do Supabase, escreve no Appwrite

# Build & Deploy
npm run build
npm run preview
npm run lint

# Reset (se algo der errado)
# 1. Deletar collections no Appwrite
# 2. Recriar collections
# 3. Rodar migração novamente
```

---

## 📈 Próximos Passos Após Setup

1. Completar funções faltantes (ver PASSO 3️⃣)
2. Adicionar autenticação (Appwrite Auth)
3. Implementar backup automático
4. Monitorar performance
5. Considerar migrar histórico completo (se necessário)

---

## 📞 Contato & Suporte

- **Documentação Appwrite**: https://appwrite.io/docs
- **Console Appwrite**: https://cloud.appwrite.io/console
- **Status**: 🟡 Aguardando execução dos passos acima

---

**Criado em**: 2026-05-18
**Status**: 📋 Pronto para Deploy
