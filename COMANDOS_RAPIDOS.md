# ⚡ COMANDOS RÁPIDOS

## 📖 LEITURA OBRIGATÓRIA (em ordem)

1. **Este arquivo** (você está aqui!)
2. `RESUMO.md` - Overview em português
3. `SETUP.md` - Passo a passo completo
4. `ARQUITETURA.md` - Diagramas e arquitetura

---

## 🚀 SETUP INICIAL

```bash
# 1. Instalar dependências
npm install

# 2. Copiar arquivo de ambiente
cp .env.example .env.local

# 3. Editar .env.local com suas credenciais Appwrite
#    (deixar as variáveis APPWRITE_* preenchidas)

# 4. Testar dev server
npm run dev
# Acessa http://localhost:3000
```

---

## 💾 MIGRAÇÃO DE DADOS

```bash
# ⚠️ COMANDO IMPORTANTE - SÓ RODAR UMA VEZ! ⚠️
npm run migrate-supabase-to-appwrite

# Isto vai:
# - Ler TODOS os dados do Supabase
# - Inserir no Appwrite em lotes
# - Gerar relatório: migration-report.json
#
# Tempo: 1-6 horas (depende do volume)
# NÃO INTERROMPA! Se der erro, é seguro rodar novamente

# Ver progresso:
tail -f migration-report.json
```

---

## 🧪 TESTES

```bash
# Teste 1: Conectar ao Appwrite
npm run dev
# F12 → Console → Cole isto:
import { appwrite } from './src/appwrite.ts';
const data = await appwrite.from('lc131_despesas').select('*').limit(1);
console.log(data);

# Teste 2: Chamar função
const result = await appwrite.rpc('lc131_dashboard', { p_ano: 2024 });
console.log(result);

# Teste 3: Verificar coleção
# Ir ao console Appwrite e checar:
# - Database ID: database-69ea274b00316d3d1dfb
# - Collection: lc131_despesas
# - Documents count: deve mostrar número de documentos

# Teste 4: Lint/Type check
npm run lint
```

---

## 🔧 BUILD & DEPLOY

```bash
# Build para produção
npm run build

# Preview do build (simula produção)
npm run preview

# Deploy (Vercel/Netlify/seu host)
vercel deploy --prod
# ou
netlify deploy --prod

# Não esquecer: Adicionar variáveis de ambiente no seu host!
# - VITE_APPWRITE_ENDPOINT
# - VITE_APPWRITE_PROJECT
# - VITE_APPWRITE_DATABASE
```

---

## 🧹 LIMPEZA & RESET

```bash
# Limpar build
npm run clean

# Remover node_modules (para reinstalar)
rm -rf node_modules package-lock.json
npm install

# Remover dados do Appwrite (se der ruim):
# 1. Ir ao console Appwrite
# 2. Ir a Database → Collections
# 3. Selecionar collection
# 4. Clique nos "..." → Delete Collection
# 5. Recriar collections
# 6. Rodar migração novamente
```

---

## 📝 EDIÇÕES NECESSÁRIAS NO CÓDIGO

### Edit 1: Trocar import em src/App.tsx (linha ~11)

**DE:**
```typescript
import { supabase } from './supabase';
```

**PARA:**
```typescript
import { appwrite as supabase } from './appwrite';
```

Pronto! O resto do código continua igual.

---

## 🔑 VARIÁVEIS DE AMBIENTE

```bash
# .env.local (NUNCA commitar)
VITE_APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT=69ea271e000d28e3afce
VITE_APPWRITE_DATABASE=database-69ea274b00316d3d1dfb
APPWRITE_API_KEY=standard_8834bd8610e14b14457c14af3d1ebaa4de0a89405faeb1186a02d517d251b31c125896555137773df5d8fc00f87bb0f67b032cdb5f2dea1b6d4841b9b0d46e8022df8202ccd30b5b9046bf190eb9f5c0e26501ffbc89527f94e8c95eb14c627af38568f0647b64973868741b16b8e2d0ac257b8b1a838600c24a7d6120edf204

# Verificar se está carregando:
npm run dev
# Abrir DevTools (F12) → Application → Environment variables
# Deve mostrar VITE_APPWRITE_* preenchidas
```

---

## 📱 URLs IMPORTANTES

```
Appwrite Console:
https://cloud.appwrite.io/console/project-69ea271e000d28e3afce

Database:
https://cloud.appwrite.io/console/project-69ea271e000d28e3afce/databases/database-69ea274b00316d3d1dfb

Functions:
https://cloud.appwrite.io/console/project-69ea271e000d28e3afce/functions

App Local:
http://localhost:3000

API Base:
https://fra.cloud.appwrite.io/v1
```

---

## 🆘 TROUBLESHOOTING RÁPIDO

| Erro | Solução |
|------|---------|
| "Collection not found" | Verificar IDs em `src/appwrite.ts` |
| "API Key invalid" | Regenerar API Key no console Appwrite |
| "Timeout" | Aumentar `Query.limit()` ou paginar |
| "Dados antigos" | Limpar cache: `Ctrl+Shift+R` |
| "npm: command not found" | Instalar Node.js |
| "Port 3000 em uso" | Trocar porta: `vite --port 3001` |
| "Migration muito lenta" | Normal (1-6h), não interromper |

---

## 📊 ACOMPANHAMENTO

```bash
# Ver tamanho do build
ls -lh dist/

# Ver número de registros migrados
grep "migratedRecords" migration-report.json

# Ver erros de migração
grep "error\|failed" migration-report.json | head -20

# Monitorar disco usado
df -h /
```

---

## ✅ CHECKLIST RÁPIDO

```
Antes de começar:
[ ] Node.js v18+ instalado (npm -v)
[ ] npm install executado
[ ] .env.local criado e preenchido
[ ] Acesso ao console Appwrite confirmado

Configuração:
[ ] Collections criadas no Appwrite
[ ] 3 Appwrite Functions deployadas
[ ] Índices criados nas collections
[ ] Variáveis de ambiente definidas nas funções

Testes:
[ ] npm run dev funciona
[ ] Conexão ao Appwrite testada (console)
[ ] RPC lc131_dashboard testada
[ ] Dados aparecem no dashboard

Migração:
[ ] npm run migrate-supabase-to-appwrite completado
[ ] migration-report.json gerado
[ ] Dados validados no console Appwrite
[ ] Contagem de registros conferida

Deploy:
[ ] src/App.tsx atualizado (1 linha)
[ ] npm run build sem erros
[ ] npm run preview funciona
[ ] Deploy realizado (Vercel/Netlify/etc)
```

---

## 🎯 ORDEM CORRETA DE EXECUÇÃO

```
1️⃣  Ler documentação (RESUMO.md → SETUP.md)
2️⃣  npm install
3️⃣  Criar .env.local
4️⃣  Criar collections no console Appwrite
5️⃣  Deploy de funções (upload manual)
6️⃣  Testar: npm run dev
7️⃣  Validar conexão (F12 → console.log)
8️⃣  npm run migrate-supabase-to-appwrite
9️⃣  Atualizar App.tsx (1 linha)
🔟 npm run build
1️⃣1️⃣ npm run preview
1️⃣2️⃣ Deploy final
```

---

## 📞 REFERÊNCIA RÁPIDA

```javascript
// Exemplo de query
const data = await appwrite
  .from('lc131_despesas')
  .select('*')
  .limit(100);

// Exemplo de RPC
const result = await appwrite.rpc('lc131_dashboard', {
  p_ano: 2024,
  p_drs: null,
  p_municipio: 'São Paulo'
});

// Exemplo de insert
const inserted = await appwrite
  .from('lc131_despesas')
  .insert([
    { ano_referencia: 2024, municipio: 'São Paulo', ... },
    { ano_referencia: 2024, municipio: 'Rio de Janeiro', ... }
  ]);

// Exemplo de delete
const deleted = await appwrite
  .from('lc131_despesas')
  .delete((doc) => doc.ano_referencia === 2024);
```

---

## 🚨 CUIDADOS

1. **NÃO COMMITAR .env.local** - adicionar ao .gitignore
2. **NÃO INTERROMPER migrate** - leva horas e precisa completar
3. **NÃO DELETAR SUPABASE** - deixar até confirmar Appwrite
4. **NÃO ESQUECER VARS DE AMBIENTE** - em produção
5. **NÃO RODAR MIGRATE 2X** - dados podem duplicar (mas é seguro repetir)

---

## ⏱️ TEMPO ESTIMADO

- Setup: 30 min
- Testes: 15 min
- Migração: 1-6 horas (automático)
- Deploy: 30 min
- **TOTAL: 2-7 horas** (maioria automática)

---

**Última atualização**: 2026-05-18
**Versão**: 1.0

## 🎯 PRÓXIMO PASSO

👉 **Leia `RESUMO.md` agora!**
