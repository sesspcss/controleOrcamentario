# 🚀 Deployment das Appwrite Functions

## Visão Geral

Este diretório contém as Appwrite Functions que substituem as RPCs SQL do Supabase.

```
appwrite-functions/
├── lc131-dashboard/           # Agregações principais
├── lc131-map-data/            # Dados para mapas
├── lc131-delete-year/         # Deletar ano
├── lc131-pivot-multi/         # (TODO)
├── get-lc131-id-range/        # (TODO)
├── fix-tipo-despesa/          # (TODO)
├── post-import-cleanup/       # (TODO)
└── refresh-dashboard-batch/   # (TODO)
```

---

## 📋 Funções Implementadas

### ✅ `lc131-dashboard`
**Arquivo**: `lc131-dashboard/index.js`

Retorna agregações de despesas (KPIs + dimensões).

**Entrada (POST body)**:
```json
{
  "p_ano": 2024,
  "p_drs": null,
  "p_municipio": null,
  "p_tipo_despesa": null,
  "p_limit": 100
}
```

**Saída**:
```json
{
  "success": true,
  "data": {
    "empenhado": 1000000,
    "liquidado": 500000,
    "pago_total": 300000,
    "por_drs": [...],
    "por_municipio": [...]
  }
}
```

---

### ✅ `lc131-map-data`
**Arquivo**: `lc131-map-data/index.js`

Retorna dados agregados por município e DRS (para visualização em mapa).

**Entrada**:
```json
{
  "p_ano": 2024
}
```

**Saída**:
```json
{
  "success": true,
  "data": {
    "por_municipio": [
      {"municipio": "São Paulo", "empenhado": 1000, ...},
      {...}
    ],
    "por_drs": [...]
  }
}
```

---

### ✅ `lc131-delete-year`
**Arquivo**: `lc131-delete-year/index.js`

Deleta todos os registros de um ano.

**Entrada**:
```json
{
  "p_ano": 2024
}
```

**Saída**:
```json
{
  "success": true,
  "message": "150000 registros deletados do ano 2024",
  "total_deleted": 150000
}
```

---

## ⏳ Funções Ainda Não Implementadas

- [ ] `lc131-pivot-multi` - Análise cruzada de dimensões
- [ ] `get-lc131-id-range` - Retorna min/max ID por ano
- [ ] `fix-tipo-despesa-by-year` - Enriquece tipo_despesa
- [ ] `post-import-cleanup` - Cleanup pós-importação
- [ ] `refresh-dashboard-batch` - Atualização incremental
- [ ] `refresh-bdref-lookup` - Reconstrói lookup tables

---

## 🔧 Como Fazer Deploy

### Opção 1: Console Appwrite (Manual)

1. Abra https://cloud.appwrite.io/console/project-69ea271e000d28e3afce/functions

2. Clique em "Create Function"

3. Configure:
   - **Name**: `lc131-dashboard`
   - **Runtime**: Node.js 19
   - **Execution Permissions**: Select "Any"

4. Cole o código de `lc131-dashboard/index.js`

5. Clique em "Deploy"

6. Defina variáveis de ambiente:
   ```
   APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1
   APPWRITE_PROJECT=69ea271e000d28e3afce
   APPWRITE_DATABASE=database-69ea274b00316d3d1dfb
   APPWRITE_API_KEY=<sua-api-key>
   ```

7. Repita para cada função

---

### Opção 2: CLI Appwrite (Automático)

```bash
# 1. Instalar CLI
npm install -g appwrite-cli

# 2. Login
appwrite login

# 3. Navegar para o projeto
cd appwrite-functions

# 4. Deploy todas as funções
appwrite deploy --all
```

**Arquivo de configuração** (`appwrite.json`):
```json
{
  "projectId": "69ea271e000d28e3afce",
  "functions": [
    {
      "functionId": "lc131-dashboard",
      "name": "lc131-dashboard",
      "runtime": "node-19",
      "path": "./lc131-dashboard",
      "env": {
        "APPWRITE_ENDPOINT": "https://fra.cloud.appwrite.io/v1",
        "APPWRITE_PROJECT": "69ea271e000d28e3afce",
        "APPWRITE_DATABASE": "database-69ea274b00316d3d1dfb",
        "APPWRITE_API_KEY": "..."
      }
    },
    {
      "functionId": "lc131-map-data",
      "name": "lc131-map-data",
      "runtime": "node-19",
      "path": "./lc131-map-data"
    },
    // ... mais funções
  ]
}
```

---

## 🧪 Como Testar uma Função

### Via Console
1. Na função, clique em "Executions"
2. Clique em "Test"
3. Preencha o corpo (body):
   ```json
   {
     "p_ano": 2024
   }
   ```
4. Clique em "Execute"

### Via Curl
```bash
curl -X POST https://fra.cloud.appwrite.io/v1/functions/lc131-dashboard/executions \
  -H "X-Appwrite-Project: 69ea271e000d28e3afce" \
  -H "Content-Type: application/json" \
  -d '{
    "p_ano": 2024
  }'
```

### Via JavaScript
```javascript
import { appwrite } from '../src/appwrite.ts';

const result = await appwrite.rpc('lc131_dashboard', {
  p_ano: 2024,
  p_drs: null
});

console.log(result.data);
```

---

## 🔐 Segurança

### Permissões de Execução
- As funções devem estar acessíveis para usuários anônimos (role: `any`)
- Ou adicionar autenticação via JWT token

**Adicionar autenticação**:
```javascript
// No início da função
const token = req.headers['x-appwrite-token'];
if (!token) {
  return res.json({ error: 'Unauthorized' }, 401);
}
```

### Rate Limiting
Appwrite tem rate limiting padrão. Se necessário aumentar:
- Contatar suporte ou usar plano higher-tier
- Implementar rate limiting no frontend

---

## 📊 Variáveis de Ambiente

Cada função precisa destas variáveis no console:

```env
APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1
APPWRITE_PROJECT=69ea271e000d28e3afce
APPWRITE_DATABASE=database-69ea274b00316d3d1dfb
APPWRITE_API_KEY=standard_8834bd8610e14b14457c14af3d1ebaa4de0a89405faeb1186a02d517d251b31c125896555137773df5d8fc00f87bb0f67b032cdb5f2dea1b6d4841b9b0d46e8022df8202ccd30b5b9046bf190eb9f5c0e26501ffbc89527f94e8c95eb14c627af38568f0647b64973868741b16b8e2d0ac257b8b1a838600c24a7d6120edf204
```

---

## 🚨 Troubleshooting

### "Function not found"
- Verificar ID da função no console
- Atualizar em `APPWRITE_CONFIG.FUNCTIONS` no `src/appwrite.ts`

### "Database not found"
- Verificar ID do database: `database-69ea274b00316d3d1dfb`
- Verificar ID da collection: `lc131_despesas`

### "API Key invalid"
- Regenerar API Key no console Appwrite
- Atualizar em `.env.local`

### Timeout
- Aumentar query limit (Appwrite limita a ~1000 docs)
- Implementar paginação
- Verificar índices nas collections

### Memory exceeded
- Reduzir batch size
- Usar paginação com offset

---

## 📈 Próximos Passos

1. **Deploy das funções**: Usar console ou CLI
2. **Testes**: Executar testes via curl/JavaScript
3. **Integração**: Atualizar `App.tsx` para usar as funções
4. **Migração**: Executar script de migração de dados
5. **Deploy da app**: Build e deploy para produção

---

**Status**: 🟡 Em Desenvolvimento
**Última atualização**: 2026-05-18
