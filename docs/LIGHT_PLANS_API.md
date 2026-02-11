# API de Planos Light (30 dias)

## GET /light/plans/status (agregador)

Retorna status dos 4 planos em uma chamada.

**Query params:** `assessment_id`, `company_id` (obrigatórios)

**Resposta 200:**
```json
{
  "by_process": {
    "comercial": { "exists": true, "plan_id": "uuid", "completed": false, "has_plan_30d": true, "updated_at": "..." },
    "operacoes": { "exists": false },
    "adm_fin": { "exists": true, "plan_id": "uuid", "completed": false, "has_plan_30d": false, "updated_at": "..." },
    "gestao": { "exists": false }
  },
  "all_done": false
}
```

- `all_done`: true quando os 4 processos têm `exists` e `has_plan_30d`.
- `exists`: free_action existe para o processo.
- `has_plan_30d`: light_action_plan salvo (step_1, step_2, etc).

## Contrato idempotente

Ao clicar "Abrir plano (X)" ou salvar plano 30d, o backend **nunca** retorna 400 por duplicidade. Sempre retorna 200 (ou 201 na criação) com payload claro.

## Endpoints

### GET /light/plans/:processKey/status

Status do plano por processo. `processKey`: `comercial` | `operacoes` | `adm_fin` | `gestao`.

**Query params:** `assessment_id`, `company_id` (obrigatórios)

**Resposta 200:**
```json
{ "exists": false }
```
ou
```json
{
  "exists": true,
  "plan_id": "uuid",
  "completed": false,
  "updated_at": "2026-02-05T12:00:00.000Z"
}
```

### GET /light/plans/:processKey

Retorna o plano salvo (free_action + light_plan + evidence).

**Query params:** `assessment_id`, `company_id` (obrigatórios)

**Resposta 200:**
```json
{
  "plan_id": "uuid",
  "free_action": { "id", "assessment_id", "process", ... },
  "light_plan": { "step_1", "step_2", "step_3", ... } | null,
  "evidence": { ... } | null,
  "completed": false
}
```

**404:** Plano não encontrado para o processo.

### POST /light/plans

Cria ou atualiza plano 30d. **Idempotente.**

**Body:** `assessment_id`, `company_id`, `process`, `free_action_id`, `step_1`, `step_2`, `step_3`, `owner_name`, `metric`, `checkpoint_date`

**Resposta 201 (criado):**
```json
{
  "id": "uuid",
  "step_1": "...",
  ...
  "created": true,
  "already_exists": false,
  "plan_id": "uuid"
}
```

**Resposta 200 (já existente):**
```json
{
  "id": "uuid",
  ...
  "created": false,
  "already_exists": true,
  "plan_id": "uuid",
  "message": "Plano já existente. Atualizado."
}
```

**Resposta 200 (bloqueado/concluído):**
```json
{
  "created": false,
  "already_exists": true,
  "plan_id": "uuid",
  "message": "Plano já concluído para este processo."
}
```

### POST /assessments/:id/free-actions/select

Seleciona ação gratuita. **Idempotente:** se já existe para o processo, retorna 200 (nunca 400).

**Resposta 200 (já existe):**
```json
{
  "id": "uuid",
  "assessment_id": "uuid",
  "company_id": "uuid",
  "process": "COMERCIAL",
  "created": false,
  "already_exists": true,
  "plan_id": "uuid",
  "message": "Plano já existe para este processo."
}
```

**Resposta 201 (criado):**
```json
{
  "id": "uuid",
  ...
  "created": true,
  "already_exists": false,
  "plan_id": "uuid"
}
```

## Regras

- `processKey` aceita lowercase: comercial, operacoes, adm_fin, gestao
- Existência: `(owner_user_id, assessment_id, process)` — `assessment_id` = cycle equivalente
- 400 apenas para payload inválido (campos ausentes, process inválido). Nunca para "já existe".
