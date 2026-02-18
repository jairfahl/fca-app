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
  /docs        (contratos de API, arquitetura)
  /catalogs    (catálogo FULL canônico)
  AGENTS.md    (instruções para agentes — raiz)
  package.json (root com workspaces)
  .env.example
```

Para orientação detalhada de arquitetura e regras por contexto, ver [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) e os arquivos `AGENTS.md` em cada pasta.

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
   - `FULL_TEST_MODE`: (opcional) Quando `true`, qualquer usuário pode acessar FULL sem pagamento. Útil para QA. Default: `false`.
   - `FULL_ADMIN_WHITELIST`: (opcional) Emails separados por vírgula que sempre têm acesso FULL (ex: `admin@fca.com,fca@fca.com`). Independente de `FULL_TEST_MODE`.

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
- `009_d1_leads_triage.sql`: Tabela de triagem de leads (Gate D1)
- `010_light_action_plans_progress.sql`: Evolução de planos Light
- `011_light_action_plans_compat.sql`: Compatibilidade light_action_plans
- `012_allow_fallback_recommendation_id.sql`: recommendation_id TEXT para fallbacks (fallback-COMERCIAL etc.)
- `013_assessment_free_action_evidences_fix.sql`: Correção da coluna free_action_id em evidências
- `014_full_module_schema.sql`: Módulo FULL — ciclo, catálogos, respostas, scores, recomendações, ações, evidência, notas consultor
- `015_full_dod_evidence.sql`: Evidência DoD (critérios de conclusão) por ação
- `016_full_question_bank.sql`: answer_type e dimension em perguntas
- `017_full_findings.sql`: Findings persistidos (3 vazamentos + 3 alavancas)
- `018_full_catalog_segment_and_microvalue.sql`: segment_applicability e typical_impact_text
- `019_full_process_quick_win.sql`: quick_win em full_process_catalog
- `020_full_cycle_history.sql`: histórico de ciclos FULL
- `021_full_fallback_honest_titles.sql`: títulos honestos para fallbacks
- `022_help_requests.sql`: tabela de solicitações de ajuda
- `023_full_cause_engine.sql`: motor de causa (taxonomia, mecanismos)
- `024_full_root_cause_schema.sql`: full_gap_instances, full_cause_answers, full_gap_causes
- `025_full_gap_instances_status.sql`: status CAUSE_PENDING / CAUSE_CLASSIFIED em full_gap_instances
- `026_full_value_events.sql`: eventos de valor

## Scripts disponíveis

- `npm run dev`: Inicia API e Web em modo desenvolvimento (usa concurrently)
- `npm run install:all`: Instala dependências de todos os workspaces
- `npm run db:migrate`: Aplica migrações pendentes do banco de dados
- `npm run db:seed`: Popula recommendations_catalog e catálogo FULL (processos, perguntas, recomendações, ações)
- `npm run db:seed:full`: Popula apenas o catálogo FULL a partir de `catalogs/full/*.json`
- `npm run e2e:full`: E2E fluxo FULL com causa (requer API rodando, TEST_EMAIL/TEST_PASSWORD no .env)
- `npm run auth:diagnose`: Diagnóstico do Supabase Auth (health, usuários, teste de login). Identifica se 500 "Database error querying schema" é problema do Auth/schema.
- `npm run auth:bootstrap`: Cria/atualiza usuários de teste (fca@fca.com, consultor@fca.com, admin@fca.com) com senha `senha123` e roles corretas.

## Workspaces

- `apps/api`: API Node.js com Express
- `apps/web`: Aplicação Next.js 14 (App Router)

## Rotas Frontend (Next.js)

### Autenticação
- `/login`: Página de login
- `/signup`: Página de cadastro
- `/logout`: Logout e redirecionamento

### Onboarding
- `/onboarding`: Criação da primeira empresa (redireciona para `/diagnostico` ao criar/listar company)

### Diagnóstico
- `/diagnostico?company_id=<uuid>`: Diagnóstico LIGHT (12 perguntas). Se já existe assessment LIGHT COMPLETED, redireciona para o resultado existente
- `/results?assessment_id=<uuid>&company_id=<uuid>`: Resultados do diagnóstico LIGHT + recomendações rápidas (4 processos) + CTAs
- `/recommendations?assessment_id=<uuid>&company_id=<uuid>`: Recomendações (F3) + seleção LIGHT (4 ações: 1 por processo)
- `/free-action/[id]?company_id=<uuid>&assessment_id=<uuid>`: Registrar evidência (F3), com retorno preservando contexto
- `/plano-30-dias?assessment_id=<uuid>&company_id=<uuid>`: Visualização consolidada dos 4 planos de 30 dias

### Papéis (USER / CONSULTOR / ADMIN)
- **USER**: vê apenas sua empresa e diagnósticos. Botão "Solicitar ajuda" (abre pedido auditável).
- **CONSULTOR**: acesso transversal — `/full/consultor` (home), lista empresas, abre qualquer `company_id`, vê histórico FULL, ações, evidências, relatórios. Pode registrar notas por ação.
- **ADMIN**: mesmo que CONSULTOR + pode ativar modo teste.

Credenciais de teste: USER `fca@fca.com`, CONSULTOR `consultor@fca.com`, ADMIN `admin@fca.com` (senha: `senha123`). Role em `app_metadata.role` (JWT). Ver `scripts/set-user-roles.js` e `docs/roles.md`.

### Paywall e FULL
- `/paywall?company_id=<uuid>`: Página de planos (placeholder)
- `/full?company_id=<uuid>`: Diagnóstico completo (requer entitlement FULL)
- `/full/wizard?company_id=&assessment_id=`: Wizard do diagnóstico FULL (4 processos, 12 perguntas cada)
- `/full/diagnostico?company_id=&assessment_id=`: Navegação por processo do diagnóstico FULL
- `/full/resultados?company_id=&assessment_id=`: Resultados FULL — Raio-X do dono (3 vazamentos + 3 alavancas), CTA por status do plano
- `/full/acoes?company_id=&assessment_id=`: Seleção de 3 ações (assinar plano mínimo). Suporta `?action_key=` (foco) e `?conteudo_definicao=1` (aviso). Ações do mecanismo obrigatórias (quando há causa classificada) exibem badge "Obrigatório"
- `/full/dashboard?company_id=&assessment_id=`: Dashboard de execução (3 ações). Suporta `?action_key=` (scroll)
- `/full/relatorio?company_id=&full_version=`: Gerar/baixar relatório PDF
- `/full/historico?company_id=`: Histórico de versões FULL
- `/full/comparar?company_id=&from=&to=`: Comparação entre versões
- `/full/consultor`: Área do consultor (CONSULTOR/ADMIN) — lista empresas, selecionar empresa, ver histórico/ações/relatórios

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
- `POST /assessments/:id/free-actions/select`: Seleciona recomendação como ação gratuita (máx. 1 por processo). **Idempotente**: se já existe para o processo, retorna 200 com o existente (nunca 400)
- `POST /free-actions/:id/evidence`: Registra evidência textual (write-once)
- `GET /free-actions/:id`: Recupera ação gratuita com recomendação e evidência
- `GET /light/plans?assessment_id=&company_id=`: Lista planos Light (30 dias) por assessment
- `GET /light/plans/:processKey/status?assessment_id=&company_id=`: Status do plano por processo (`exists`, `plan_id`, `completed`, `updated_at`)
- `GET /light/plans/:processKey?assessment_id=&company_id=`: Retorna plano salvo por processo (free_action + light_plan)
- `POST /light/plans`: Cria/atualiza plano Light (30 dias). Idempotente: se já existe, retorna 200 com `already_exists: true` (nunca 400 por duplicidade)

### Entitlements e Paywall (F4)
- `GET /entitlements?company_id=<uuid>`: Retorna entitlement do usuário (default: LIGHT/ACTIVE) e `can_access_full` (gate centralizado)
- `POST /entitlements/full/activate_test?company_id=<uuid>`: Ativa FULL em modo teste (whitelist ou FULL_TEST_MODE). Persiste entitlement.
- `POST /paywall/events`: Registra eventos do paywall (VIEW_PAYWALL, CLICK_UPGRADE, UNLOCK_FULL)
- `POST /entitlements/manual-unlock`: Desbloqueia FULL manualmente (apenas dev/QA, não production)
- `GET /full/diagnostic?company_id=<uuid>`: Retorna diagnóstico completo (gate: FULL/ACTIVE, whitelist ou FULL_TEST_MODE)

### Iniciativas FULL (F4B)
- `GET /full/assessments/:id/initiatives?company_id=<uuid>`: Gera/retorna Top 10-12 de iniciativas FULL determinísticas (persistido)

### Módulo FULL — Ciclo completo
- `GET /full/catalog?segment=C|I|S&company_id=`: Catálogo de processos e perguntas (microvalor, typical_impact_text)
- `GET /full/plan/status?assessment_id=&company_id=`: Status do plano mínimo (`exists`, `progress`, `next_action_title`)
- `GET /full/results?assessment_id=&company_id=`: Resultados FULL (findings, six_pack: vazamentos + alavancas)
- `GET /full/actions?assessment_id=&company_id=`: Sugestões de ações para o plano (3 por findings). Retorna `mechanism_required_action_keys` quando há causas classificadas (ações obrigatórias do mecanismo).
- `POST /full/plan?company_id=`: Cria/atualiza plano mínimo (3 ações). Body: `{ assessment_id, actions: [...] }`. Exige pelo menos 1 ação do mecanismo quando há causas classificadas (400 `MECHANISM_ACTION_REQUIRED` com `mechanism_action_keys`).
- `GET /full/assessments/:id/plan?company_id=`: Lista plano (3 ações selecionadas)
- `GET /full/assessments/:id/dashboard?company_id=`: Dashboard consolidado (scores, actions, evidence)

### Gate C - Visão Gerencial Estruturada
- `GET /full/assessments/:id/summary?company_id=<uuid>`: Resumo executivo do diagnóstico FULL (scores, critical gaps, top initiatives, dependencies, highlights)
- `GET /full/assessments/:id/next-best-actions?company_id=<uuid>`: Próximas melhores ações (ready_now vs blocked_by baseado em dependências)

### Códigos de erro comuns (API)

| Código | HTTP | Descrição |
|--------|------|-----------|
| `DIAG_INCOMPLETE` | 400 | Faltam respostas. Payload: `missing`, `missing_process_keys`, `answered_count`, `total_expected` |
| `CATALOG_INVALID` | 500 | Catálogo inconsistente (ex.: processo sem perguntas) |
| `FINDINGS_FAILED` | 500 | Falha ao gerar findings. Payload: `debug_id` |
| `MECHANISM_ACTION_REQUIRED` | 400 | Plano sem ação do mecanismo. Payload: `mechanism_action_keys` |
| `DIAG_NOT_DRAFT` | 400 | Assessment já enviado; respostas não aceitas |
| `DIAG_ALREADY_SUBMITTED` | 400 | Diagnóstico já concluído |

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
13 migração(ões) pendente(s)
MIGRATION APPLIED: 001_init.sql
...
MIGRATION APPLIED: 013_assessment_free_action_evidences_fix.sql
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

- `AGENTS.md`: Instruções-mãe para agentes (backend fonte de verdade, linguagem PME)
- `docs/ARCHITECTURE.md`: Arquitetura consolidada e referência aos AGENTS por contexto
- `AUTH_FAIL_CLOSED_FIX.md`: Documentação da correção crítica de segurança
- `F3_AUDIT_EVIDENCE.md`: Evidências de auditoria para F3 (recomendações e ações gratuitas)
- `F3_CURL_EXAMPLES.md`: Exemplos de cURL para testar endpoints F3
- `scripts/FREE_ACTIONS_SELECT_IDEMPOTENT_EVIDENCE.md`: Evidência da idempotência do select (200/201)
- `F4_DOCUMENTATION.md`: Documentação completa do F4 (entitlements e paywall)
- `GATEC_NEXT_BEST_ACTIONS.md`: Documentação do endpoint next-best-actions (Gate C)
- `GATEC_SCHEMA_FIXES.md`: Documentação dos ajustes de schema para robustez
- `scripts/GATEC_EVIDENCE_README.md`: Guia dos scripts de evidência para Gate C
- `docs/LIGHT_PLANS_API.md`: Contrato da API de planos Light (status, read, create idempotente)
- `docs/FULL_MODULE_SCHEMA.md`: Schema do módulo FULL (tabelas, migrations)
- `docs/FULL_QUESTION_BANK_API.md`: Contrato da API de catálogo e perguntas FULL
- `catalogs/full/README.md`: Catálogo canônico FULL (processes, questions, recommendations, actions)

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
