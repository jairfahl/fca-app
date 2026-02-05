# Gate D1 - Evidências de Auditoria

---

Ultima atualizacao: 2026-02-04.
## Objetivo
Permitir PASS/FAIL objetivo do Gate D1 através de evidências documentadas.

## Evidências

### 1. Prints das Telas

#### 1.1 Tela de Resultados LIGHT com Teaser FULL
**Arquivo:** `[ANEXAR_PRINT_1.png]`

**Descrição:**
- Bloco "Teaser FULL" visível
- TOP 3 iniciativas exibidas
- Locked count: "+X iniciativas no FULL"
- Botão "Liberar Relatório Executivo Completo"
- Botão "Quero falar com um consultor"

---

#### 1.2 Modal de Triagem
**Arquivo:** `[ANEXAR_PRINT_2.png]`

**Descrição:**
- Modal com 3 perguntas:
  1. Qual é sua principal dor hoje?
  2. Em quanto tempo você precisa ver resultados?
  3. Qual seu orçamento mensal para melhorias?

---

#### 1.3 Confirmação após Submit
**Arquivo:** `[ANEXAR_PRINT_3.png]`

**Descrição:**
- Mensagem: "✓ Sua solicitação foi enviada. Entraremos em contato em breve."
- Botão "Quero falar com um consultor" desabilitado com texto "Solicitação enviada ✓"

---

### 2. cURL - GET /assessments/:id/full-teaser

```bash
curl -X GET "http://localhost:3001/assessments/{assessment_id}/full-teaser" \
  -H "Authorization: Bearer {jwt_token}" \
  -H "Content-Type: application/json"
```

**Resposta esperada (200):**
```json
{
  "items": [
    {
      "title": "...",
      "process": "...",
      "impact": "...",
      "dependency_phrase": "...",
      "next_best_action_phrase": "..."
    }
  ],
  "locked_count": 9,
  "inaction_cost": "..."
}
```

**Resposta real:**
```json
[COLAR_RESPOSTA_AQUI]
```

---

### 3. cURL - POST /leads/triage

```bash
curl -X POST "http://localhost:3001/leads/triage" \
  -H "Authorization: Bearer {jwt_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "company_id": "{company_id}",
    "assessment_id": "{assessment_id}",
    "pain": "CAIXA",
    "horizon": "30",
    "budget_monthly": "ATE_300",
    "consent": true
  }'
```

**Resposta esperada (201):**
```json
{
  "id": "...",
  "owner_user_id": "...",
  "company_id": "...",
  "assessment_id": "...",
  "pain": "CAIXA",
  "horizon": "30",
  "budget_monthly": "ATE_300",
  "created_at": "..."
}
```

**Resposta real:**
```json
[COLAR_RESPOSTA_AQUI]
```

**Teste de duplicidade (409):**
```bash
# Executar mesmo payload novamente
curl -X POST "http://localhost:3001/leads/triage" \
  -H "Authorization: Bearer {jwt_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "company_id": "{company_id}",
    "assessment_id": "{assessment_id}",
    "pain": "CAIXA",
    "horizon": "30",
    "budget_monthly": "ATE_300",
    "consent": true
  }'
```

**Resposta esperada (409):**
```json
{
  "error": "triagem já registrada para este assessment"
}
```

---

### 4. Query SQL - Verificação de Dados

```sql
-- Verificar triagem persistida
SELECT * FROM public.leads_triage 
WHERE assessment_id = '{assessment_id}';
```

**Resultado esperado:**
```
id | owner_user_id | company_id | assessment_id | pain  | horizon | budget_monthly | created_at
---|---------------|------------|---------------|-------|---------|----------------|------------
...| ...          | ...        | ...          | CAIXA | 30      | ATE_300        | ...
```

**Resultado real:**
```
[COLAR_RESULTADO_AQUI]
```

**Verificar RLS (usuário só vê próprios registros):**
```sql
-- Como usuário A
SELECT * FROM public.leads_triage;

-- Como usuário B (não deve ver registros do usuário A)
SELECT * FROM public.leads_triage;
```

---

### 5. Prova de Determinismo

#### 5.1 GET /assessments/:id/full-teaser

**Teste:** Executar mesma requisição 2x e comparar BODY_HASH normalizado.

**Requisição 1:**
```bash
curl -X GET "http://localhost:3001/assessments/{assessment_id}/full-teaser" \
  -H "Authorization: Bearer {jwt_token}" \
  -H "Content-Type: application/json" \
  | jq -S '.' > response1.json
```

**Requisição 2:**
```bash
curl -X GET "http://localhost:3001/assessments/{assessment_id}/full-teaser" \
  -H "Authorization: Bearer {jwt_token}" \
  -H "Content-Type: application/json" \
  | jq -S '.' > response2.json
```

**Comparação:**
```bash
# Normalizar JSON (ordenar chaves) e calcular hash
cat response1.json | jq -S '.' | sha256sum
cat response2.json | jq -S '.' | sha256sum
```

**Resultado esperado:**
```
BODY_HASH1 == BODY_HASH2
```

**Resultado real:**
```
HASH1: [COLAR_HASH_AQUI]
HASH2: [COLAR_HASH_AQUI]
✅ PASS / ❌ FAIL
```

---

#### 5.2 POST /leads/triage (idempotência)

**Teste:** Tentar inserir mesmo registro 2x.

**Primeira requisição (201):**
```bash
curl -X POST "http://localhost:3001/leads/triage" \
  -H "Authorization: Bearer {jwt_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "company_id": "{company_id}",
    "assessment_id": "{assessment_id}",
    "pain": "VENDA",
    "horizon": "60",
    "budget_monthly": "DE_301_800",
    "consent": true
  }'
```

**Segunda requisição (mesmo payload - 409):**
```bash
curl -X POST "http://localhost:3001/leads/triage" \
  -H "Authorization: Bearer {jwt_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "company_id": "{company_id}",
    "assessment_id": "{assessment_id}",
    "pain": "VENDA",
    "horizon": "60",
    "budget_monthly": "DE_301_800",
    "consent": true
  }'
```

**Resultado esperado:**
- Primeira: `201 Created`
- Segunda: `409 Conflict` com mensagem "triagem já registrada para este assessment"

**Resultado real:**
```
[COLAR_RESULTADOS_AQUI]
```

---

## Checklist de Validação

- [ ] Prints das telas anexados
- [ ] cURL GET /full-teaser executado e resposta documentada
- [ ] cURL POST /leads/triage executado e resposta documentada
- [ ] Query SQL executada e resultado documentado
- [ ] Prova de determinismo (BODY_HASH1 == BODY_HASH2) documentada
- [ ] Teste de duplicidade (409) documentado
- [ ] RLS verificado (usuário só vê próprios registros)

## Data de Geração

- **Data:** [Preencher]
- **Ambiente:** [Preencher: local/CI]
- **Versão:** [Preencher: git commit hash]
- **Assessment ID usado:** [Preencher]
- **Company ID usado:** [Preencher]

## Observações

[Espaço para observações adicionais]
