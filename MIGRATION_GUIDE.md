# 🚀 Guia de Migração: Supabase → Appwrite

## Contexto
Projeto ficou sem espaço no Supabase. Migração para Appwrite (https://cloud.appwrite.io).

**Dados do Appwrite:**
- URL: https://fra.cloud.appwrite.io/v1
- Project ID: `69ea271e000d28e3afce`
- Database ID: `database-69ea274b00316d3d1dfb`
- API Key: (armazenado em `.env.local`)

---

## ✅ Checklist de Migração

### Fase 1: Preparação
- [x] Criar projeto no Appwrite
- [x] Criar database e collections
- [x] Criar arquivo `src/appwrite.ts` com wrapper compatível
- [x] Atualizar `package.json` com dependências Appwrite
- [x] Criar script de migração de dados
- [ ] Testar conexão Appwrite

### Fase 2: Migração de Dados
- [ ] Executar script de migração: `npm run migrate-supabase-to-appwrite`
- [ ] Validar dados migrados no console Appwrite
- [ ] Verificar contagem de registros

### Fase 3: Recriar RPCs
- [ ] `lc131_dashboard` → Appwrite Function
- [ ] `lc131_map_data` → Appwrite Function
- [ ] `lc131_pivot_multi` → Appwrite Function
- [ ] `refresh_bdref_lookup` → Appwrite Function
- [ ] `get_lc131_id_range` → Appwrite Function
- [ ] `fix_tipo_despesa_by_year` → Appwrite Function
- [ ] `post_import_cleanup` → Appwrite Function
- [ ] `lc131_delete_year` → Appwrite Function
- [ ] `refresh_dashboard_batch` → Appwrite Function

### Fase 4: Atualizar App.tsx
- [ ] Trocar import: `supabase` → `appwrite`
- [ ] Testar carregamento de dados
- [ ] Testar filtros e agregações
- [ ] Testar import de dados
- [ ] Testar delete de anos

### Fase 5: Testes e Deploy
- [ ] Testes no ambiente local
- [ ] Build: `npm run build`
- [ ] Deploy e teste final
- [ ] Remover configurações Supabase antigas

---

## 📋 Estrutura de Collections no Appwrite

### Collection: `lc131_despesas` (Principal)
```json
{
  "name": "LC131 Despesas",
  "attributes": {
    "$id": { "type": "string", "required": true, "key": true },
    "ano_referencia": { "type": "integer" },
    "nome_municipio": { "type": "string" },
    "codigo_ug": { "type": "string" },
    "codigo_projeto_atividade": { "type": "string" },
    "empenhado": { "type": "float" },
    "liquidado": { "type": "float" },
    "pago_total": { "type": "float" },
    "drs": { "type": "string" },
    "rras": { "type": "string" },
    "regiao_ad": { "type": "string" },
    "municipio": { "type": "string" },
    "tipo_despesa": { "type": "string" },
    "rotulo": { "type": "string" },
    "fonte_recurso": { "type": "string" },
    "grupo_despesa": { "type": "string" },
    // ... mais campos conforme necessário
  },
  "indexes": [
    "ano_referencia",
    "drs",
    "municipio",
    "tipo_despesa",
    "fonte_recurso"
  ]
}
```

### Collection: `bd_ref` (Referência)
```json
{
  "name": "Base de Dados de Referência",
  "attributes": {
    "$id": { "type": "string", "required": true, "key": true },
    "codigo": { "type": "string" },
    "unidade": { "type": "string" },
    "drs": { "type": "string" },
    // ... mais campos
  }
}
```

### Collection: `tab_drs`
```json
{
  "name": "DRS Lookup",
  "attributes": {
    "$id": { "type": "string", "key": true }, // municipio
    "municipio": { "type": "string" },
    "drs": { "type": "string" }
  }
}
```

### Collection: `tab_rras`
```json
{
  "name": "RRAS Lookup",
  "attributes": {
    "$id": { "type": "string", "key": true }, // municipio
    "municipio": { "type": "string" },
    "rras": { "type": "string" }
  }
}
```

---

## 🔄 Migração de RPCs

### Estrutura de Appwrite Functions

Cada RPC do Supabase será convertida em uma Appwrite Function (Node.js):

```
functions/
├── lc131-dashboard/
│   └── src/main.js
├── lc131-map-data/
│   └── src/main.js
├── ...
```

### Exemplo: `lc131_dashboard`

**Antes (Supabase SQL):**
```sql
CREATE OR REPLACE FUNCTION lc131_dashboard(p_ano INT, p_drs TEXT, ...)
RETURNS json AS $$
  SELECT json_build_object(
    'empenhado', SUM(empenhado),
    'liquidado', SUM(liquidado),
    'pago_total', SUM(pago_total),
    'por_drs', ...
  ) FROM lc131_despesas WHERE ...
$$ LANGUAGE sql;
```

**Depois (Appwrite Function - Node.js):**
```javascript
// functions/lc131-dashboard/src/main.js
const { Client, Databases, Query } = require('appwrite');

module.exports = async function (req, res) {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT)
    .setKey(process.env.APPWRITE_API_KEY);

  const databases = new Databases(client);

  try {
    const { p_ano, p_drs, ... } = req.body;

    // Construir queries
    const queries = [Query.equal('ano_referencia', p_ano)];
    if (p_drs) queries.push(Query.equal('drs', p_drs));

    // Buscar dados
    const docs = await databases.listDocuments(
      process.env.APPWRITE_DATABASE,
      'lc131_despesas',
      queries
    );

    // Agregar
    let empenhado = 0, liquidado = 0, pago_total = 0;
    for (const doc of docs.documents) {
      empenhado += doc.empenhado || 0;
      liquidado += doc.liquidado || 0;
      pago_total += doc.pago_total || 0;
    }

    return res.json({
      empenhado,
      liquidado,
      pago_total,
      total: docs.total,
      por_drs: [], // ... construir agregações
    });
  } catch (error) {
    return res.json({ error: error.message }, 500);
  }
};
```

---

## 🔧 Instalação e Setup

### 1. Instalar dependências
```bash
npm install appwrite
```

### 2. Criar arquivo `.env.local`
```env
VITE_APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT=69ea271e000d28e3afce
VITE_APPWRITE_DATABASE=database-69ea274b00316d3d1dfb
APPWRITE_API_KEY=standard_8834bd8610e14b14457c14af3d1ebaa4de0a89405faeb1186a02d517d251b31c125896555137773df5d8fc00f87bb0f67b032cdb5f2dea1b6d4841b9b0d46e8022df8202ccd30b5b9046bf190eb9f5c0e26501ffbc89527f94e8c95eb14c627af38568f0647b64973868741b16b8e2d0ac257b8b1a838600c24a7d6120edf204
```

### 3. Executar migração de dados
```bash
npm run migrate-supabase-to-appwrite
```

### 4. Atualizar `src/App.tsx`
```typescript
// Trocar
import { supabase } from './supabase';

// Por
import { appwrite as supabase } from './appwrite'; // Compatibilidade de API
```

### 5. Deploy das Appwrite Functions
```bash
# Deploy cada função individualmente via console Appwrite
# Ou usar CLI: appwrite push --functionId lc131-dashboard
```

---

## 🧪 Testes

### Testar conexão
```bash
# No console do navegador
import { appwrite } from './src/appwrite.ts';

const data = await appwrite.from('lc131_despesas').select('*').limit(1);
console.log(data);
```

### Testar RPC
```bash
const result = await appwrite.rpc('lc131_dashboard', {
  p_ano: 2024,
  p_drs: null,
});
console.log(result);
```

---

## 📊 Comparação: Supabase vs Appwrite

| Aspecto | Supabase | Appwrite |
|--------|----------|----------|
| **Modelo** | PostgreSQL puro | BaaS (Backend as a Service) |
| **Query** | SQL nativa | REST API com Query filters |
| **RPC** | SQL Functions | Node.js Functions |
| **Autenticação** | JWT nativo | Built-in auth com sessions |
| **Storage** | Nativo | Via Bucket API |
| **Limite de dados** | Conforme plano | Mais generoso em storage |
| **Performance** | Muito rápido | Dependente da rede |

---

## ⚠️ Considerações Importantes

1. **Limite de documentos por request**: Appwrite tem limite de ~1000 docs. Para tabelas grandes, usar paginação.

2. **Transações**: Appwrite não suporta transações ACID como PostgreSQL. Implementar logica de retry.

3. **Índices**: Criar índices nas collections para otimizar queries.

4. **RLS (Row Level Security)**: Appwrite usa Permissions em vez de políticas SQL.

5. **Real-time**: Se precisar de real-time, usar Appwrite Realtime em vez de Supabase subscriptions.

---

## 🐛 Troubleshooting

### "Collection not found"
- Verificar IDs de database/collection no console Appwrite
- Atualizar `APPWRITE_CONFIG` em `src/appwrite.ts`

### "Query too complex"
- Appwrite tem limitações de filtros. Implementar paginação no frontend.

### "Timeout"
- Aumentar batch size no script de migração se tiver memória
- Ou diminuir se tiver muitos timeouts

### "API Key invalid"
- Regenerar API Key no console Appwrite
- Atualizar em `.env.local`

---

## 📞 Próximos Passos

1. **Setup das Collections**: Execute os scripts de criação no console Appwrite
2. **Migração de dados**: Rode o script `migrate-to-appwrite.ts`
3. **Deploy das Functions**: Crie cada Appwrite Function manualmente ou via CLI
4. **Testes unitários**: Adicione testes para cada RPC
5. **Deploy da app**: Build e deploy com as novas configurações

---

**Última atualização**: 2026-05-18
**Status**: ⏳ Em Progresso
