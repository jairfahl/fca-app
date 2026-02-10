# Evidência: Idempotência do POST /assessments/:id/free-actions/select

## Comportamento esperado

- **1ª chamada** (não existe free_action para o processo): **201 Created** com novo registro
- **2ª chamada** (mesmo assessment + processo): **200 OK** com o registro existente (mesmo `id`)

## Como rodar o teste

```bash
# 1. Obter um assessment_id do usuário de teste (fluxo: onboarding -> diagnostico -> submit)
# 2. Com API rodando em localhost:3001:
./scripts/test-free-actions-select-idempotent.sh <ASSESSMENT_ID>

# Opcional: especificar recommendation_id (default: fallback-COMERCIAL)
./scripts/test-free-actions-select-idempotent.sh <ASSESSMENT_ID> fallback-OPERACOES
```

## Exemplo de saída esperada (PASS)

```
== Teste idempotência: POST /assessments/:id/free-actions/select
   assessment_id=xxx recommendation_id=fallback-COMERCIAL

1ª chamada (esperado: 201):
   Status: 201
   id: <uuid>

2ª chamada (esperado: 200, mesmo id):
   Status: 200
   id: <uuid>

PASS: Idempotência OK (2ª=200, mesmo id em ambas)
```

## Contrato da API

**POST** `/assessments/:assessment_id/free-actions/select`

**Body:**
```json
{ "recommendation_id": "fallback-COMERCIAL" }
```

**Resposta 200 ou 201:**
```json
{
  "id": "uuid",
  "assessment_id": "uuid",
  "company_id": "uuid",
  "process": "COMERCIAL",
  "recommendation_id": "fallback-COMERCIAL",
  "status": "ACTIVE",
  "created_at": "ISO8601"
}
```

**Nunca retorna 400** por "já existe ação gratuita" — retorna 200 com o existente.
