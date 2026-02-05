# FCA MTR

Monorepo com API (Node/Express) e Web (Next.js).

## Estrutura

```
~/Downloads/fca-mtr
  /apps
    /api        (Node + Express na porta 3001)
    /web        (Next.js na porta 3000)
  /db
    /migrations
    /seed
  package.json  (root com workspaces)
  .env.example
```

## Instalação

1. Navegue até o diretório do projeto:
```bash
cd ~/Downloads/fca-mtr
```

2. Instale as dependências do root e dos workspaces:
```bash
npm install
```

## Configuração

1. Copie o arquivo `.env.example` para `.env` no root:
```bash
cp .env.example .env
```

2. Configure as variáveis de ambiente no arquivo `.env`:
   - `DATABASE_URL`: URL do banco de dados PostgreSQL/Supabase
   - `SUPABASE_URL`: URL do projeto Supabase
   - `SUPABASE_ANON_KEY`: Chave pública do Supabase
   - `SUPABASE_SERVICE_ROLE_KEY`: Chave de serviço do Supabase
   - `PORT`: Porta da API (padrão: 3001)
   - `NODE_ENV`: Ambiente (development/production)
   - `FRONTEND_ORIGINS`: Origens permitidas para CORS (ex: `http://localhost:3000,http://localhost:3001`)
   - `DB_SSL_RELAXED`: Configuração SSL (opcional, apenas desenvolvimento). Veja [docs/DB_SSL.md](docs/DB_SSL.md) para detalhes.

## Como rodar

Execute o comando único no root para subir front e back em desenvolvimento:

```bash
npm run dev
```

Isso irá:
- Iniciar a API em `http://localhost:3001`
- Iniciar a Web em `http://localhost:3000`

## Evidência de READY

Quando a API estiver pronta e escutando na porta, você verá no console a mensagem:

```
API START
DB CHECK OK
READY
Server listening on http://localhost:3001
```

A mensagem **"READY"** é impressa quando o servidor Express começa a escutar na porta configurada, confirmando que o backend está pronto para receber requisições.

## Migrações de Banco de Dados

Para aplicar as migrações do banco de dados:

```bash
npm run db:migrate
```

Este comando irá:
1. Ler a variável `DATABASE_URL` do arquivo `.env`
2. Criar a tabela `public.schema_migrations` se não existir
3. Aplicar todas as migrações pendentes em ordem
4. Registrar cada migração aplicada

### Evidências esperadas

Ao executar `npm run db:migrate`, você verá no console:

```
Iniciando migrações...
1 migração(ões) pendente(s)
MIGRATION APPLIED: 001_init.sql
MIGRATION APPLIED: 003_f3_recommendations_ranked.sql
MIGRATION APPLIED: 004_f3_assessment_free_actions.sql
MIGRATION APPLIED: 005_f3_assessment_free_action_evidences.sql
MIGRATION APPLIED: 006_f4_entitlements.sql
MIGRATIONS OK
```

Se todas as migrações já foram aplicadas:

```
Iniciando migrações...
Nenhuma migração pendente.
MIGRATIONS OK
```

### Estrutura de Migrações

As migrações estão localizadas em `db/migrations/`:
- `001_init.sql`: Criação inicial de todas as tabelas do sistema (users, companies, assessments, assessment_items, scores, recommendations_catalog, assessment_recommendations, free_actions, action_evidences)
- `002_f2_schema_fixes.sql`: Ajustes de schema para alinhar com uso real do código (owner_user_id, segment, type, colunas por processo em scores)
- `003_f3_recommendations_ranked.sql`: Tabela para Top 10 de recomendações por assessment
- `004_f3_assessment_free_actions.sql`: Tabela para ações gratuitas selecionadas
- `005_f3_assessment_free_action_evidences.sql`: Tabela para evidências das ações gratuitas (write-once)
- `006_f4_entitlements.sql`: Tabelas para controle de acesso (entitlements) e eventos de paywall (paywall_events)
- `007_f4b_full_initiatives.sql`: Tabela legacy de iniciativas FULL (não utilizada)
- `008_f4b_full_initiatives_catalog_and_rank.sql`: Catálogo de iniciativas FULL e ranking persistido por assessment

## Scripts disponíveis

- `npm run dev`: Inicia API e Web em modo desenvolvimento (usa concurrently)
- `npm run install:all`: Instala dependências de todos os workspaces
- `npm run db:migrate`: Aplica migrações pendentes do banco de dados
- `npm run db:seed`: Popula tabela recommendations_catalog com dados iniciais

## Workspaces

- `apps/api`: API Node.js com Express
- `apps/web`: Aplicação Next.js 14 (App Router)

## Rotas Frontend (Next.js)

### Autenticação
- `/login`: Página de login
- `/signup`: Página de cadastro
- `/logout`: Logout e redirecionamento

### Onboarding
- `/onboarding`: Criação da primeira empresa (redireciona para `/diagnostico` se já existe)

### Diagnóstico
- `/diagnostico?company_id=<uuid>`: Tela de diagnóstico (LIGHT ou FULL conforme entitlement)
- `/results?assessment_id=<uuid>`: Resultados do diagnóstico LIGHT
- `/recommendations?assessment_id=<uuid>`: Top 10 de recomendações (F3)
- `/free-action/[id]`: Página para executar ação gratuita e registrar evidência (F3)

### Paywall e FULL
- `/paywall?company_id=<uuid>`: Página de planos (placeholder)
- `/full?company_id=<uuid>`: Diagnóstico completo (requer entitlement FULL)
- `/full/diagnostic?company_id=<uuid>`: Página do diagnóstico completo FULL (requer entitlement FULL)

## Endpoints Backend (Express)

### Autenticação
- `GET /ping`: Health check com verificação de DB
- Todos os endpoints abaixo requerem `Authorization: Bearer <jwt_token>`

### Companies (F2)
- `GET /companies`: Lista companies do usuário autenticado
- `POST /companies`: Cria nova company

### Assessments (F2)
- `POST /assessments/light`: Cria assessment LIGHT (status DRAFT)
- `POST /assessments/:id/light/submit`: Submete assessment LIGHT (persiste 12 itens, calcula scores, marca COMPLETED)
- `GET /assessments/:id`: Recupera assessment completo (items + scores)

### Recommendations e Free Actions (F3)
- `GET /assessments/:id/recommendations`: Gera/retorna Top 10 de recomendações determinísticas
- `POST /assessments/:id/free-actions/select`: Seleciona recomendação como ação gratuita (máx. 1 por processo)
- `POST /free-actions/:id/evidence`: Registra evidência textual (write-once)
- `GET /free-actions/:id`: Recupera ação gratuita com recomendação e evidência

### Entitlements e Paywall (F4)
- `GET /entitlements?company_id=<uuid>`: Retorna entitlement do usuário para uma company (default: LIGHT/ACTIVE)
- `POST /paywall/events`: Registra eventos do paywall (VIEW_PAYWALL, CLICK_UPGRADE, UNLOCK_FULL)
- `POST /entitlements/manual-unlock`: Desbloqueia FULL manualmente (apenas dev/QA, não production)
- `GET /full/diagnostic?company_id=<uuid>`: Retorna diagnóstico completo (requer entitlement FULL/ACTIVE)

### Iniciativas FULL (F4B)
- `GET /full/assessments/:id/initiatives?company_id=<uuid>`: Gera/retorna Top 10-12 de iniciativas FULL determinísticas (persistido)

### Gate C - Visão Gerencial Estruturada
- `GET /full/assessments/:id/summary?company_id=<uuid>`: Resumo executivo do diagnóstico FULL (scores, critical gaps, top initiatives, dependencies, highlights)
- `GET /full/assessments/:id/next-best-actions?company_id=<uuid>`: Próximas melhores ações (ready_now vs blocked_by baseado em dependências)

## Evidências F1 — copiar/colar

### 1. `npm run dev` — API imprime "READY"

```bash
$ npm run dev
```

**Output esperado:**
```
API START
DB CHECK OK
READY
Server listening on http://localhost:3001
```

### 2. `npm run db:migrate` — imprime "MIGRATIONS OK"

**Primeira execução:**
```bash
$ npm run db:migrate
```

**Output esperado:**
```
Iniciando migrações...
8 migração(ões) pendente(s)
MIGRATION APPLIED: 001_init.sql
MIGRATION APPLIED: 002_f2_schema_fixes.sql
MIGRATION APPLIED: 003_f3_recommendations_ranked.sql
MIGRATION APPLIED: 004_f3_assessment_free_actions.sql
MIGRATION APPLIED: 005_f3_assessment_free_action_evidences.sql
MIGRATION APPLIED: 006_f4_entitlements.sql
MIGRATION APPLIED: 007_f4b_full_initiatives.sql
MIGRATION APPLIED: 008_f4b_full_initiatives_catalog_and_rank.sql
MIGRATIONS OK
```

**Execuções subsequentes:**
```bash
$ npm run db:migrate
```

**Output esperado:**
```
Iniciando migrações...
Nenhuma migração pendente.
MIGRATIONS OK
```

### 3. `npm run db:seed` — imprime "SEED OK: recommendations_catalog <n>"

**Primeira execução:**
```bash
$ npm run db:seed
```

**Output esperado:**
```
SEED OK: recommendations_catalog 66
  - Inseridas: 66
  - Atualizadas: 0
```

**Execuções subsequentes (idempotente):**
```bash
$ npm run db:seed
```

**Output esperado:**
```
SEED OK: recommendations_catalog 66
  - Inseridas: 0
  - Atualizadas: 66
```

### 4. GET /ping — retorna ok=true e db.ok=true

```bash
$ curl http://localhost:3001/ping
```

**Output esperado:**
```json
{
  "ok": true,
  "service": "api",
  "db": {
    "ok": true,
    "now": "2026-01-30T14:30:00.000Z"
  }
}
```

**Nota:** O campo `now` conterá o timestamp atual do banco de dados em formato ISO.

## Segurança

### Autenticação (FAIL-CLOSED)

O middleware `requireAuth` opera em modo **FAIL-CLOSED**:
- Validação criptográfica obrigatória via JWKS (ES256)
- Qualquer falha na validação = 401 imediato
- Nenhum token adulterado é aceito

Ver documentação completa em `AUTH_FAIL_CLOSED_FIX.md`.

### Row Level Security (RLS)

Todas as tabelas possuem RLS habilitado:
- Usuários só acessam dados de suas próprias companies
- Validação explícita de ownership no backend (defesa em profundidade)

## Documentação Adicional

- `AUTH_FAIL_CLOSED_FIX.md`: Documentação da correção crítica de segurança
- `F3_AUDIT_EVIDENCE.md`: Evidências de auditoria para F3 (recomendações e ações gratuitas)
- `F3_CURL_EXAMPLES.md`: Exemplos de cURL para testar endpoints F3
- `F4_DOCUMENTATION.md`: Documentação completa do F4 (entitlements e paywall)
- `GATEC_NEXT_BEST_ACTIONS.md`: Documentação do endpoint next-best-actions (Gate C)
- `GATEC_SCHEMA_FIXES.md`: Documentação dos ajustes de schema para robustez
- `scripts/GATEC_EVIDENCE_README.md`: Guia dos scripts de evidência para Gate C

## Desenvolvimento

### Estrutura de Features

- **F1**: Setup inicial, migrações, seed
- **F2**: Autenticação, Companies CRUD, Assessments LIGHT
- **F3**: Recommendations (Top 10), Free Actions, Evidences
- **F4**: Entitlements, Paywall, Gate FULL
- **F4B**: Iniciativas FULL (catálogo e ranking persistido)
- **Gate C**: Visão Gerencial Estruturada (summary, next-best-actions)

### Padrões de Código

- Backend: Node.js + Express, CommonJS (`require/module.exports`)
- Frontend: Next.js 14 App Router, TypeScript, React Hooks
- Banco: PostgreSQL/Supabase, migrações idempotentes
- Autenticação: Supabase Auth, JWT com validação criptográfica
