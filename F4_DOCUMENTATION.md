# Documentação F4 - Entitlements e Paywall

## Visão Geral

F4 implementa controle de acesso baseado em entitlements (LIGHT/FULL) e sistema de paywall com trilha de eventos auditável.

## Arquitetura

### Backend

**Arquivos principais:**
- `apps/api/src/routes/f4.js`: Rotas de entitlements e paywall
- `apps/api/src/middleware/requireFullEntitlement.js`: Middleware para proteger endpoints FULL
- `db/migrations/006_f4_entitlements.sql`: Migração das tabelas

**Tabelas:**
- `public.entitlements`: Fonte de verdade do acesso (LIGHT/FULL por user+company)
- `public.paywall_events`: Trilha auditável de eventos (VIEW_PAYWALL, CLICK_UPGRADE, UNLOCK_FULL)

### Frontend

**Arquivos principais:**
- `apps/web/src/app/full/page.tsx`: Página do diagnóstico completo (gate baseado em entitlement)
- `apps/web/src/app/diagnostico/page.tsx`: Tela de diagnóstico com paywall
- `apps/web/src/app/paywall/page.tsx`: Página de planos (placeholder)
- `apps/web/src/lib/apiAuth.ts`: Helper para chamadas autenticadas com token sempre atualizado

## Endpoints Backend

### GET /entitlements

Retorna entitlements do usuário autenticado.

**Query params:**
- `company_id` (opcional): Filtra por company específica

**Comportamento:**
- Se `company_id` fornecido:
  - Retorna entitlement específico para `(user_id, company_id)`
  - Se não existir, retorna default: `{ plan: 'LIGHT', status: 'ACTIVE', source: 'MANUAL', company_id }`
- Se `company_id` não fornecido:
  - Retorna array com todos os entitlements do usuário

**Exemplo de resposta (com company_id):**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "company_id": "uuid",
  "plan": "FULL",
  "status": "ACTIVE",
  "source": "MANUAL",
  "created_at": "2026-01-30T12:00:00Z",
  "updated_at": "2026-01-30T12:00:00Z"
}
```

**Exemplo de resposta (sem entitlement, com company_id):**
```json
{
  "plan": "LIGHT",
  "status": "ACTIVE",
  "source": "MANUAL",
  "company_id": "uuid"
}
```

**Status HTTP:**
- `200`: Sucesso
- `401`: Token ausente ou inválido
- `500`: Erro ao buscar entitlements

### POST /paywall/events

Registra evento do paywall (audit trail).

**Body:**
```json
{
  "event": "VIEW_PAYWALL" | "CLICK_UPGRADE" | "UNLOCK_FULL",
  "company_id": "uuid" (opcional),
  "meta": {} (opcional)
}
```

**Eventos permitidos:**
- `VIEW_PAYWALL`: Usuário visualizou paywall
- `CLICK_UPGRADE`: Usuário clicou em botão de upgrade
- `UNLOCK_FULL`: Entitlement FULL foi desbloqueado

**Exemplo de resposta (201):**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "company_id": "uuid",
  "event": "VIEW_PAYWALL",
  "meta": { "screen": "full" },
  "created_at": "2026-01-30T12:00:00Z"
}
```

**Status HTTP:**
- `201`: Evento registrado
- `400`: Event inválido ou ausente
- `401`: Token ausente ou inválido
- `500`: Erro ao registrar evento

### POST /entitlements/manual-unlock

Desbloqueia entitlement FULL manualmente (apenas dev/QA, não production).

**Body:**
```json
{
  "company_id": "uuid"
}
```

**Comportamento:**
- Valida que `company_id` existe e pertence ao usuário
- Upsert em `entitlements` com `plan='FULL'`, `status='ACTIVE'`, `source='MANUAL'`
- Retorna entitlement criado/atualizado

**Proteção:**
- Bloqueado em `NODE_ENV === 'production'` (retorna 403)

**Exemplo de resposta (201):**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "company_id": "uuid",
  "plan": "FULL",
  "status": "ACTIVE",
  "source": "MANUAL",
  "created_at": "2026-01-30T12:00:00Z",
  "updated_at": "2026-01-30T12:00:00Z"
}
```

**Status HTTP:**
- `201`: Entitlement criado
- `200`: Entitlement atualizado
- `400`: company_id inválido
- `403`: Bloqueado em production
- `404`: Company não encontrada ou não pertence ao usuário
- `500`: Erro ao criar/atualizar entitlement

### GET /full/diagnostic

Retorna diagnóstico completo (requer entitlement FULL/ACTIVE).

**Query params:**
- `company_id` (obrigatório): ID da company

**Middleware:**
- `requireAuth`: Valida JWT
- `requireFullEntitlement`: Valida entitlement FULL/ACTIVE para `(user_id, company_id)`

**Comportamento:**
- Valida que company existe e pertence ao usuário
- Busca assessment mais recente da company
- Busca items do assessment
- Retorna payload completo

**Exemplo de resposta (200):**
```json
{
  "ok": true,
  "company": {
    "id": "uuid",
    "name": "Nome da Empresa"
  },
  "assessment": {
    "id": "uuid",
    "company_id": "uuid",
    "type": "LIGHT",
    "status": "COMPLETED",
    "created_at": "2026-01-30T12:00:00Z",
    "completed_at": "2026-01-30T12:30:00Z"
  },
  "items": [
    {
      "id": "uuid",
      "assessment_id": "uuid",
      "process": "COMERCIAL",
      "activity": "ATIVIDADE_1",
      "score_int": 7
    }
  ]
}
```

**Status HTTP:**
- `200`: Diagnóstico retornado
- `400`: company_id ausente ou inválido
- `401`: Token ausente ou inválido
- `403`: Entitlement FULL não encontrado ou inativo
- `404`: Company não encontrada ou diagnóstico não encontrado
- `500`: Erro ao buscar diagnóstico

## Middleware requireFullEntitlement

**Arquivo:** `apps/api/src/middleware/requireFullEntitlement.js`

**Comportamento:**
- Requer `requireAuth` antes (valida JWT)
- Lê `company_id` de `req.query.company_id` ou `req.body.company_id`
- Busca entitlement FULL/ACTIVE para `(req.user.id, company_id)`
- Se não encontrar: retorna 403 `{ error: "conteúdo disponível apenas no FULL" }`
- Se encontrar: chama `next()`

**Uso:**
```javascript
router.get('/full/diagnostic', requireAuth, requireFullEntitlement, async (req, res) => {
  // Endpoint protegido por gate FULL
});
```

## Fluxo Frontend

### Página /full

**Arquivo:** `apps/web/src/app/full/page.tsx`

**Fluxo:**
1. Lê `company_id` da querystring
2. Chama `GET /entitlements?company_id=...`
3. Normaliza resposta (pode ser objeto único ou array)
4. Verifica se existe entitlement FULL/ACTIVE
5. Se não FULL:
   - Renderiza paywall
   - Registra `VIEW_PAYWALL` (apenas uma vez por sessão)
   - **NÃO** chama `/full/diagnostic`
6. Se FULL:
   - Chama `GET /full/diagnostic?company_id=...`
   - Renderiza conteúdo completo

**Proteções anti-loop:**
- `useRef` para evitar múltiplas execuções
- `useEffect` depende apenas de `companyId`
- Reset de refs quando `companyId` muda

### Página /diagnostico

**Arquivo:** `apps/web/src/app/diagnostico/page.tsx`

**Fluxo:**
1. Ao carregar, chama `GET /full/diagnostic?company_id=...`
2. Se 200: mostra "Diagnóstico completo"
3. Se 403: mostra paywall e registra `VIEW_PAYWALL`
4. Botão "Desbloquear diagnóstico completo":
   - Registra `CLICK_UPGRADE`
   - (Dev only) Executa `manual-unlock`
   - (Dev only) Registra `UNLOCK_FULL`
   - (Dev only) Força refresh de sessão
   - Navega para `/full?company_id=...`

## Exemplos cURL

### Verificar entitlement

```bash
export API_URL="http://localhost:3001"
export JWT_TOKEN="seu_token_jwt"
export COMPANY_ID="uuid-da-company"

curl -X GET "${API_URL}/entitlements?company_id=${COMPANY_ID}" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json"
```

### Registrar evento VIEW_PAYWALL

```bash
curl -X POST "${API_URL}/paywall/events" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "VIEW_PAYWALL",
    "company_id": "'${COMPANY_ID}'",
    "meta": { "screen": "full" }
  }'
```

### Desbloquear FULL manualmente (dev only)

```bash
curl -X POST "${API_URL}/entitlements/manual-unlock" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "company_id": "'${COMPANY_ID}'"
  }'
```

### Acessar diagnóstico completo

```bash
curl -X GET "${API_URL}/full/diagnostic?company_id=${COMPANY_ID}" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json"
```

## Schema do Banco

### public.entitlements

```sql
CREATE TABLE public.entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('LIGHT','FULL')) DEFAULT 'LIGHT',
  status text NOT NULL CHECK (status IN ('ACTIVE','INACTIVE')) DEFAULT 'ACTIVE',
  source text NOT NULL CHECK (source IN ('MANUAL','PAYMENT')) DEFAULT 'MANUAL',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, company_id)
);
```

### public.paywall_events

```sql
CREATE TABLE public.paywall_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NULL REFERENCES public.companies(id) ON DELETE SET NULL,
  event text NOT NULL CHECK (event IN ('VIEW_PAYWALL','CLICK_UPGRADE','UNLOCK_FULL')),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
```

## RLS Policies

### entitlements

- SELECT: `user_id = auth.uid()`
- INSERT: `user_id = auth.uid()`
- UPDATE: `user_id = auth.uid()`

### paywall_events

- SELECT: `user_id = auth.uid()`
- INSERT: `user_id = auth.uid()`

## Evidências de Teste

### Com entitlement FULL

1. Network mostra:
   - `GET /entitlements?company_id=...` → 200
   - `GET /full/diagnostic?company_id=...` → 200

2. UI mostra:
   - Badge "Plano FULL ativo"
   - Conteúdo completo do diagnóstico

### Sem entitlement FULL

1. Network mostra:
   - `GET /entitlements?company_id=...` → 200
   - Zero chamadas para `/full/diagnostic`

2. UI mostra:
   - Paywall "Conteúdo disponível apenas no FULL"
   - CTA "Ver planos"

### Sem loops

- Network não mostra múltiplas chamadas repetidas
- Console não mostra logs duplicados
- `VIEW_PAYWALL` registrado apenas uma vez por sessão

## Troubleshooting

### Frontend recebe 403 mesmo com entitlement FULL

**Possíveis causas:**
1. Token JWT desatualizado → usar `apiFetchAuth` que sempre busca token atualizado
2. Gate no frontend não está normalizando entitlements corretamente → verificar normalização
3. Entitlement não está ACTIVE → verificar `status` no DB

**Solução:**
- Verificar Network tab: `GET /entitlements` deve retornar `plan: "FULL"` e `status: "ACTIVE"`
- Verificar que `GET /full/diagnostic` está sendo chamado apenas após gate passar
- Verificar logs do backend para ver se `requireFullEntitlement` está bloqueando

### Loops de chamadas

**Possíveis causas:**
1. `useEffect` sem dependências corretas
2. Estado sendo atualizado em cadeia causando re-renders

**Solução:**
- Usar `useRef` para evitar múltiplas execuções
- Garantir que `useEffect` depende apenas de `companyId`
- Reset de refs no cleanup do `useEffect`

## Fase B (F4B) - Iniciativas FULL

### Visão Geral

F4B implementa o catálogo de iniciativas FULL e ranking persistido por assessment, determinístico e refresh-safe.

### Arquivos Principais

- `apps/api/src/routes/f4b.js`: Endpoint para gerar/retornar ranking de iniciativas FULL
- `db/migrations/008_f4b_full_initiatives_catalog_and_rank.sql`: Migração das tabelas
- `db/seed/008_seed_full_initiatives_catalog.sql`: Seed com 12 iniciativas (3 por processo)

### Tabelas

- `public.full_initiatives_catalog`: Catálogo de iniciativas FULL (12 iniciativas determinísticas)
- `public.full_assessment_initiatives`: Ranking persistido por assessment (rank 1..12)

### Endpoint

**GET /full/assessments/:id/initiatives**

- Gera Top 10-12 determinístico se não existir ranking persistido
- Retorna ranking persistido se já existir
- Ordenação: impact (HIGH>MED>LOW), horizon (CURTO>MEDIO), created_at ASC, id ASC

## Gate C - Visão Gerencial Estruturada

### Visão Geral

Gate C implementa endpoints para composição determinística de visão gerencial estruturada do diagnóstico FULL, sem recalcular scores ou rankings.

### Arquivos Principais

- `apps/api/src/routes/gateC.js`: Endpoints de summary e next-best-actions
- `scripts/test-gatec-determinism.sh`: Script de teste de determinismo
- `scripts/test-gatec-entitlement.sh`: Script de teste de entitlement

### Endpoints

#### GET /full/assessments/:id/summary

Retorna resumo executivo determinístico:
- Scores por processo (comercial, operacoes, adm_fin, gestao, overall)
- Critical gaps (top 3 piores processos)
- Top initiatives (do ranking persistido)
- Dependencies map (derivado do catálogo)
- Highlights (templates determinísticos)

**Contrato:**
```json
{
  "ok": true,
  "summary_version": "C1",
  "data_sources": { ... },
  "company": { "id", "name" },
  "scores": { "comercial", "operacoes", "adm_fin", "gestao", "overall" },
  "critical_gaps": [ ... ],
  "top_initiatives": [ ... ],
  "dependencies_map": [ ... ],
  "highlights": [ ... ],
  "generated_at": "..."
}
```

#### GET /full/assessments/:id/next-best-actions

Retorna "o que fazer agora" baseado em dependências:
- `ready_now`: Iniciativas sem dependências (prontas para execução)
- `blocked_by`: Iniciativas com dependências (bloqueadas até dependências serem concluídas)

**Contrato:**
```json
{
  "ok": true,
  "summary_version": "C1",
  "data_sources": { ... },
  "ready_now": [ { "rank", "initiative_id", "code", "title" } ],
  "blocked_by": [ { "rank", "initiative_id", "code", "title", "blocked_reason", "depends_on": [...] } ],
  "generated_at": "..."
}
```

### Scripts de Evidência

- `scripts/test-gatec-determinism.sh`: Testa determinismo (2 chamadas = mesmo hash)
- `scripts/test-gatec-entitlement.sh`: Testa entitlement (FULL=200, LIGHT=403)
- `scripts/run-gatec-evidence.sh`: Helper para executar ambos os testes

Ver `scripts/GATEC_EVIDENCE_README.md` para detalhes.

### Documentação Adicional

- `GATEC_NEXT_BEST_ACTIONS.md`: Documentação completa do endpoint next-best-actions
- `GATEC_SCHEMA_FIXES.md`: Documentação dos ajustes de schema

## Status

✅ **IMPLEMENTADO:** Todos os endpoints F4, F4B e Gate C
✅ **TESTADO:** Gate FULL funcionando corretamente
✅ **DOCUMENTADO:** Este arquivo + README.md atualizado + documentação Gate C

## Documentação Relacionada (F3)

- `scripts/FREE_ACTIONS_SELECT_IDEMPOTENT_EVIDENCE.md`: Evidência da idempotência do POST free-actions/select (LIGHT)
