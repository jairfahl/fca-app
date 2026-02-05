# Exemplos cURL para F3

## Pré-requisitos
- Token JWT válido do Supabase (obtido via login/signup)
- Assessment ID válido (criado via POST /assessments/light)
- Free Action ID válido (criado via POST /assessments/:id/free-actions/select)

## Variáveis de ambiente
```bash
export API_URL="http://localhost:3001"
export JWT_TOKEN="seu_token_jwt_aqui"
export ASSESSMENT_ID="uuid-do-assessment"
export FREE_ACTION_ID="uuid-da-free-action"
```

---

## 1. GET /assessments/:id/recommendations

Busca ou gera o Top 10 de recomendações para um assessment.

```bash
curl -X GET "${API_URL}/assessments/${ASSESSMENT_ID}/recommendations" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json"
```

**Resposta esperada (200):**
```json
[
  {
    "recommendation_id": "uuid",
    "process": "COMERCIAL",
    "title": "Título da recomendação",
    "why": "Por que esta recomendação",
    "risk": "HIGH",
    "impact": "MED",
    "checklist": ["item1", "item2", "item3"],
    "rank": 1,
    "is_free_eligible": true,
    "is_selected_free": false,
    "is_locked": false
  },
  ...
]
```

**Erros:**
- `401`: Token ausente ou inválido
- `403`: Assessment não pertence ao usuário
- `404`: Assessment não encontrado
- `500`: Erro ao gerar/buscar recomendações

---

## 2. POST /assessments/:id/free-actions/select

Seleciona uma recomendação do Top 10 como ação gratuita.

```bash
curl -X POST "${API_URL}/assessments/${ASSESSMENT_ID}/free-actions/select" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "recommendation_id": "uuid-da-recomendacao"
  }'
```

**Resposta esperada (201):**
```json
{
  "id": "uuid-da-free-action",
  "assessment_id": "uuid-do-assessment",
  "recommendation_id": "uuid-da-recomendacao",
  "process": "COMERCIAL",
  "status": "ACTIVE",
  "created_at": "2026-01-30T12:00:00Z",
  "completed_at": null
}
```

**Erros:**
- `400`: recommendation_id não está no Top 10 OU já existe free_action para esse processo
- `401`: Token ausente ou inválido
- `403`: Assessment não pertence ao usuário
- `404`: Assessment não encontrado
- `500`: Erro ao criar ação gratuita

---

## 3. POST /free-actions/:id/evidence

Adiciona evidência textual a uma ação gratuita (write-once).

```bash
curl -X POST "${API_URL}/free-actions/${FREE_ACTION_ID}/evidence" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "evidence_text": "Evidência textual da ação realizada..."
  }'
```

**Resposta esperada (201):**
```json
{
  "success": true
}
```

**Erros:**
- `400`: evidence_text ausente ou vazio
- `401`: Token ausente ou inválido
- `403`: Free action não pertence ao usuário
- `404`: Free action não encontrada
- `409`: Evidência já existe (write-once)
- `500`: Erro ao inserir evidência

---

## 4. GET /free-actions/:id

Busca uma ação gratuita com recomendação e evidência.

```bash
curl -X GET "${API_URL}/free-actions/${FREE_ACTION_ID}" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json"
```

**Resposta esperada (200):**
```json
{
  "id": "uuid-da-free-action",
  "assessment_id": "uuid-do-assessment",
  "recommendation_id": "uuid-da-recomendacao",
  "process": "COMERCIAL",
  "status": "COMPLETED",
  "created_at": "2026-01-30T12:00:00Z",
  "completed_at": "2026-01-30T13:00:00Z",
  "recommendation": {
    "title": "Título da recomendação",
    "checklist": ["item1", "item2", "item3"]
  },
  "evidence": {
    "evidence_text": "Evidência textual...",
    "created_at": "2026-01-30T13:00:00Z"
  }
}
```

**Se não houver evidência:**
```json
{
  ...
  "status": "ACTIVE",
  "completed_at": null,
  "evidence": null
}
```

**Erros:**
- `401`: Token ausente ou inválido
- `403`: Free action não pertence ao usuário
- `404`: Free action não encontrada
- `500`: Erro ao buscar dados

---

## Fluxo completo de exemplo

```bash
# 1. Obter recomendações (gera Top 10 se não existir)
curl -X GET "${API_URL}/assessments/${ASSESSMENT_ID}/recommendations" \
  -H "Authorization: Bearer ${JWT_TOKEN}" | jq '.[0]'

# 2. Selecionar primeira recomendação como free action
REC_ID=$(curl -X GET "${API_URL}/assessments/${ASSESSMENT_ID}/recommendations" \
  -H "Authorization: Bearer ${JWT_TOKEN}" | jq -r '.[0].recommendation_id')

curl -X POST "${API_URL}/assessments/${ASSESSMENT_ID}/free-actions/select" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"recommendation_id\": \"${REC_ID}\"}" | jq '.id' > /tmp/free_action_id.txt

# 3. Adicionar evidência
FREE_ACTION_ID=$(cat /tmp/free_action_id.txt | tr -d '"')
curl -X POST "${API_URL}/free-actions/${FREE_ACTION_ID}/evidence" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"evidence_text": "Implementei a ação conforme recomendado."}'

# 4. Buscar free action completa
curl -X GET "${API_URL}/free-actions/${FREE_ACTION_ID}" \
  -H "Authorization: Bearer ${JWT_TOKEN}" | jq
```

---

## Endpoints Relacionados (F4B e Gate C)

### F4B - Iniciativas FULL

**GET /full/assessments/:id/initiatives**

```bash
curl -X GET "${API_URL}/full/assessments/${ASSESSMENT_ID}/initiatives?company_id=${COMPANY_ID}" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json"
```

**Requer:** Entitlement FULL/ACTIVE

### Gate C - Visão Gerencial

**GET /full/assessments/:id/summary**

```bash
curl -X GET "${API_URL}/full/assessments/${ASSESSMENT_ID}/summary?company_id=${COMPANY_ID}" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json"
```

**GET /full/assessments/:id/next-best-actions**

```bash
curl -X GET "${API_URL}/full/assessments/${ASSESSMENT_ID}/next-best-actions?company_id=${COMPANY_ID}" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json"
```

**Requer:** Entitlement FULL/ACTIVE

**Documentação completa:**
- `GATEC_NEXT_BEST_ACTIONS.md`: Documentação do endpoint next-best-actions
- `F4_DOCUMENTATION.md`: Documentação completa do F4, F4B e Gate C
