# Hotfix S-01 — Evidências de Auditoria

---

Ultima atualizacao: 2026-02-04.
## 1) Variáveis

```bash
BASE=http://localhost:3001
JWT=...
UID=...
COMPANY_ID=...
ASSESSMENT_COMPLETED_ID=...
ASSESSMENT_DRAFT_ID=...
```

## 2) cURLs

### 2.1 Sucesso (201)
POST /leads/triage com assessment COMPLETED do próprio usuário

```bash
curl -X POST "$BASE/leads/triage" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "company_id": "'"$COMPANY_ID"'",
    "assessment_id": "'"$ASSESSMENT_COMPLETED_ID"'",
    "pain": "CAIXA",
    "horizon": "30",
    "budget_monthly": "ATE_300",
    "consent": true
  }'
```

### 2.2 Ownership inválido (403)
POST usando assessment/company de outro user

```bash
curl -X POST "$BASE/leads/triage" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "company_id": "<COMPANY_OUTRO_USER_ID>",
    "assessment_id": "<ASSESSMENT_OUTRO_USER_ID>",
    "pain": "VENDA",
    "horizon": "60",
    "budget_monthly": "DE_301_800",
    "consent": true
  }'
```

### 2.3 Company mismatch (400)
company_id diferente do assessment.company_id

```bash
curl -X POST "$BASE/leads/triage" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "company_id": "<COMPANY_ID_DIFERENTE>",
    "assessment_id": "'"$ASSESSMENT_COMPLETED_ID"'",
    "pain": "OPERACAO",
    "horizon": "90",
    "budget_monthly": "DE_801_2000",
    "consent": true
  }'
```

### 2.4 Assessment DRAFT (400)
usar assessment não COMPLETED

```bash
curl -X POST "$BASE/leads/triage" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "company_id": "'"$COMPANY_ID"'",
    "assessment_id": "'"$ASSESSMENT_DRAFT_ID"'",
    "pain": "PESSOAS",
    "horizon": "30",
    "budget_monthly": "ZERO",
    "consent": true
  }'
```

### 2.5 Idempotência (409)
repetir exatamente a mesma triagem

```bash
curl -X POST "$BASE/leads/triage" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "company_id": "'"$COMPANY_ID"'",
    "assessment_id": "'"$ASSESSMENT_COMPLETED_ID"'",
    "pain": "CAIXA",
    "horizon": "30",
    "budget_monthly": "ATE_300",
    "consent": true
  }'
```

## 3) Query Supabase

```sql
SELECT *
FROM leads_triage
WHERE owner_user_id = '<uid>'
  AND assessment_id = '<id>';
```
