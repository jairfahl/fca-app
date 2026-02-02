# Evidências de Auditoria F3

## Pré-requisitos

1. Assessment LIGHT concluído (status = COMPLETED)
2. Scores persistidos na tabela `public.scores`
3. Seed F3 executado (`npm run db:seed:f3`)
4. Backend rodando em `http://localhost:3001`
5. Frontend rodando em `http://localhost:3000`
6. Token JWT válido do Supabase

---

## 1. Queries SQL

### 1.1 Verificar Top 10 Recommendations

```sql
-- Substituir <assessment_id> pelo ID real do assessment
SELECT * 
FROM public.assessment_recommendations 
WHERE assessment_id = '<assessment_id>' 
ORDER BY rank;
```

**Resultado esperado:**
- 10 linhas
- `rank` de 1 a 10 (sem gaps)
- Cada linha com `assessment_id`, `recommendation_id`, `process`, `rank`
- `process` distribuído entre: COMERCIAL, OPERACOES, ADM_FIN, GESTAO

**Exemplo de output:**
```
assessment_id                          | recommendation_id                    | process    | rank | created_at
--------------------------------------+--------------------------------------+------------+------+----------------------------
a1b2c3d4-e5f6-7890-abcd-ef1234567890 | rec-001-comercial-servicos          | COMERCIAL  | 1    | 2026-01-30 12:00:00+00
a1b2c3d4-e5f6-7890-abcd-ef1234567890 | rec-002-operacoes-servicos          | OPERACOES  | 2    | 2026-01-30 12:00:00+00
...
```

### 1.2 Verificar Free Actions

```sql
-- Substituir <assessment_id> pelo ID real do assessment
SELECT * 
FROM public.free_actions 
WHERE assessment_id = '<assessment_id>';
```

**Resultado esperado:**
- Máximo 4 linhas (1 por processo)
- Cada linha com `id`, `assessment_id`, `recommendation_id`, `process`, `status`
- `status` = 'ACTIVE' ou 'COMPLETED'
- `process` único por linha (UNIQUE constraint)

**Exemplo de output:**
```
id                                    | assessment_id                       | recommendation_id | process   | status    | created_at          | completed_at
--------------------------------------+--------------------------------------+-------------------+------------+-----------+---------------------+------------------
fa-001-comercial                      | a1b2c3d4-e5f6-7890-abcd-ef1234567890| rec-001-comercial | COMERCIAL  | COMPLETED | 2026-01-30 12:00:00 | 2026-01-30 13:00:00
fa-002-operacoes                      | a1b2c3d4-e5f6-7890-abcd-ef1234567890| rec-002-operacoes | OPERACOES  | ACTIVE    | 2026-01-30 12:05:00 | NULL
```

### 1.3 Verificar Evidências (Write-Once)

```sql
-- Substituir <free_action_id> pelo ID real da free_action
SELECT * 
FROM public.free_action_evidences 
WHERE free_action_id = '<free_action_id>';
```

**Resultado esperado:**
- 1 linha (write-once)
- Campos: `free_action_id`, `evidence_text`, `created_at`
- Não deve haver UPDATE ou DELETE possível (trigger bloqueia)

**Exemplo de output:**
```
free_action_id                        | evidence_text                                    | created_at
--------------------------------------+-------------------------------------------------+----------------------------
fa-001-comercial                      | Implementei a ação conforme recomendado...     | 2026-01-30 13:00:00+00
```

### 1.4 Verificar Determinismo (Comparar 2 chamadas)

```sql
-- Executar duas vezes e comparar resultados
-- Primeira chamada
SELECT recommendation_id, process, rank 
FROM public.assessment_recommendations 
WHERE assessment_id = '<assessment_id>' 
ORDER BY rank;

-- Segunda chamada (deve retornar EXATAMENTE o mesmo resultado)
SELECT recommendation_id, process, rank 
FROM public.assessment_recommendations 
WHERE assessment_id = '<assessment_id>' 
ORDER BY rank;
```

**Evidência:** Os dois SELECTs devem retornar IDs idênticos na mesma ordem.

---

## 2. Prints/Telas

### 2.1 Tela Recommendations (10 recomendações + status)

**URL:** `http://localhost:3000/recommendations?assessment_id=<assessment_id>`

**O que capturar:**
- Lista completa de 10 recomendações
- Rank visível (#1, #2, ..., #10)
- Status visível:
  - "Executar grátis" (botão azul) para `is_free_eligible=true`
  - "✓ Selecionada grátis" (badge verde) para `is_selected_free=true`
  - "🔒 Bloqueada" + "CTA Full" para `is_locked=true`
- Process visível (COMERCIAL, OPERACOES, ADM_FIN, GESTAO)
- Risk/Impact com cores

**Como capturar:**
1. Navegar para `/recommendations?assessment_id=<id>`
2. Scroll para mostrar todas as 10 recomendações
3. Screenshot completo da página

### 2.2 Tentativa de selecionar 2ª do mesmo processo (deve falhar)

**Passos:**
1. Selecionar primeira recomendação do processo COMERCIAL (rank 1)
2. Tentar selecionar segunda recomendação do mesmo processo COMERCIAL (rank 4, por exemplo)
3. Capturar mensagem de erro: "já existe ação gratuita para o processo COMERCIAL"

**cURL para testar:**
```bash
# Primeira seleção (deve funcionar)
curl -X POST "http://localhost:3001/assessments/<assessment_id>/free-actions/select" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"recommendation_id": "<rec_id_comercial_1>"}'

# Segunda seleção do mesmo processo (deve falhar com 400)
curl -X POST "http://localhost:3001/assessments/<assessment_id>/free-actions/select" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"recommendation_id": "<rec_id_comercial_2>"}'
```

**Resposta esperada (segunda chamada):**
```json
{
  "error": "já existe ação gratuita para o processo COMERCIAL"
}
```

**Status HTTP:** 400

### 2.3 Tela Free-Action com evidência registrada + COMPLETED

**URL:** `http://localhost:3000/free-action/<free_action_id>`

**O que capturar:**
- Badge "✓ Concluída" visível
- Checklist completo (read-only)
- Evidência exibida em modo read-only (não editável)
- Campo textarea desabilitado ou oculto
- Data de conclusão visível
- Status COMPLETED

**Como capturar:**
1. Navegar para `/free-action/<id>` após concluir evidência
2. Screenshot completo mostrando:
   - Status COMPLETED
   - Evidência em modo read-only
   - Data de conclusão

### 2.4 Refresh mantendo estado

**Passos:**
1. Estar na tela `/free-action/<id>` com evidência registrada
2. Pressionar F5 (refresh)
3. Verificar que:
   - Status continua COMPLETED
   - Evidência continua visível
   - Nenhum dado foi perdido

**Evidência:** Screenshot antes e depois do refresh mostrando o mesmo estado.

---

## 3. cURL Commands

### 3.1 GET /assessments/:id/recommendations

```bash
export API_URL="http://localhost:3001"
export ASSESSMENT_ID="<assessment_id>"
export JWT_TOKEN="<token>"

curl -X GET "${API_URL}/assessments/${ASSESSMENT_ID}/recommendations" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -v
```

**Resposta esperada (200):**
```json
[
  {
    "recommendation_id": "uuid-1",
    "process": "COMERCIAL",
    "title": "Título da recomendação 1",
    "why": "Por que esta recomendação",
    "risk": "HIGH",
    "impact": "MED",
    "checklist": ["item1", "item2", "item3"],
    "rank": 1,
    "is_free_eligible": true,
    "is_selected_free": false,
    "is_locked": false
  },
  {
    "recommendation_id": "uuid-2",
    "process": "OPERACOES",
    "title": "Título da recomendação 2",
    "why": "Por que esta recomendação",
    "risk": "MED",
    "impact": "HIGH",
    "checklist": ["item1", "item2"],
    "rank": 2,
    "is_free_eligible": true,
    "is_selected_free": false,
    "is_locked": false
  },
  ...
  (total: 10 itens)
]
```

**Evidência:** Array com exatamente 10 itens, ranks de 1 a 10.

### 3.2 POST /assessments/:id/free-actions/select

```bash
export RECOMMENDATION_ID="<recommendation_id>"  # ID de uma recomendação do Top 10

curl -X POST "${API_URL}/assessments/${ASSESSMENT_ID}/free-actions/select" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"recommendation_id\": \"${RECOMMENDATION_ID}\"}" \
  -v
```

**Resposta esperada (201):**
```json
{
  "id": "free-action-uuid",
  "assessment_id": "<assessment_id>",
  "recommendation_id": "<recommendation_id>",
  "process": "COMERCIAL",
  "status": "ACTIVE",
  "created_at": "2026-01-30T12:00:00Z",
  "completed_at": null
}
```

**Evidência:** Status HTTP 201, free_action criada com status ACTIVE.

### 3.3 POST /free-actions/:id/evidence

```bash
export FREE_ACTION_ID="<free_action_id>"

curl -X POST "${API_URL}/free-actions/${FREE_ACTION_ID}/evidence" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"evidence_text": "Implementei a ação conforme recomendado. Realizei X, Y e Z."}' \
  -v
```

**Resposta esperada (201):**
```json
{
  "success": true
}
```

**Evidência:** Status HTTP 201, evidência registrada.

**Teste de Write-Once (segunda chamada):**
```bash
# Segunda chamada com mesmo free_action_id (deve falhar)
curl -X POST "${API_URL}/free-actions/${FREE_ACTION_ID}/evidence" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"evidence_text": "Tentativa de sobrescrever"}' \
  -v
```

**Resposta esperada (409):**
```json
{
  "error": "evidência já existe (write-once)"
}
```

**Evidência:** Status HTTP 409, write-once funcionando.

### 3.4 GET /free-actions/:id

```bash
curl -X GET "${API_URL}/free-actions/${FREE_ACTION_ID}" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -v
```

**Resposta esperada (200):**
```json
{
  "id": "free-action-uuid",
  "assessment_id": "<assessment_id>",
  "recommendation_id": "<recommendation_id>",
  "process": "COMERCIAL",
  "status": "COMPLETED",
  "created_at": "2026-01-30T12:00:00Z",
  "completed_at": "2026-01-30T13:00:00Z",
  "recommendation": {
    "title": "Título da recomendação",
    "checklist": ["item1", "item2", "item3"]
  },
  "evidence": {
    "evidence_text": "Implementei a ação conforme recomendado...",
    "created_at": "2026-01-30T13:00:00Z"
  }
}
```

**Evidência:** Status COMPLETED, evidência presente, completed_at preenchido.

---

## 4. Prova de Determinismo

### 4.1 Teste: Duas chamadas GET retornam o mesmo resultado

**Script de teste:**

```bash
#!/bin/bash

export API_URL="http://localhost:3001"
export ASSESSMENT_ID="<assessment_id>"
export JWT_TOKEN="<token>"

echo "=== Primeira chamada GET /assessments/:id/recommendations ==="
curl -X GET "${API_URL}/assessments/${ASSESSMENT_ID}/recommendations" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -s | jq -r '.[] | "\(.rank)|\(.recommendation_id)|\(.process)"' > /tmp/f3_call1.txt

echo ""
echo "=== Segunda chamada GET /assessments/:id/recommendations ==="
curl -X GET "${API_URL}/assessments/${ASSESSMENT_ID}/recommendations" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -s | jq -r '.[] | "\(.rank)|\(.recommendation_id)|\(.process)"' > /tmp/f3_call2.txt

echo ""
echo "=== Comparação ==="
if diff -q /tmp/f3_call1.txt /tmp/f3_call2.txt > /dev/null; then
  echo "✓ SUCESSO: As duas chamadas retornaram o mesmo resultado"
  echo ""
  echo "Primeira chamada:"
  cat /tmp/f3_call1.txt
  echo ""
  echo "Segunda chamada:"
  cat /tmp/f3_call2.txt
else
  echo "✗ FALHA: As chamadas retornaram resultados diferentes"
  echo ""
  echo "Diferenças:"
  diff /tmp/f3_call1.txt /tmp/f3_call2.txt
fi

rm /tmp/f3_call1.txt /tmp/f3_call2.txt
```

**Evidência esperada:**
```
=== Comparação ===
✓ SUCESSO: As duas chamadas retornaram o mesmo resultado

Primeira chamada:
1|rec-uuid-1|COMERCIAL
2|rec-uuid-2|OPERACOES
3|rec-uuid-3|ADM_FIN
...

Segunda chamada:
1|rec-uuid-1|COMERCIAL
2|rec-uuid-2|OPERACOES
3|rec-uuid-3|ADM_FIN
...
```

### 4.2 Verificação no Banco de Dados

**Query para verificar que não houve recálculo:**

```sql
-- Verificar created_at de todas as recomendações
-- Todas devem ter o mesmo timestamp (geradas na primeira chamada)
SELECT rank, recommendation_id, process, created_at
FROM public.assessment_recommendations
WHERE assessment_id = '<assessment_id>'
ORDER BY rank;
```

**Evidência:** Todos os `created_at` devem ser idênticos (ou muito próximos, dentro de milissegundos), provando que foram criados em uma única transação na primeira chamada.

### 4.3 Logs do Backend

**Verificar logs do backend:**

```
Gerando Top 10 para assessment <assessment_id>
```

**Evidência:** Esta mensagem deve aparecer **apenas uma vez** na primeira chamada GET. A segunda chamada não deve gerar esta mensagem (retorna do DB).

---

## 5. Checklist de Validação

- [ ] Query SQL retorna 10 recomendações com ranks 1-10
- [ ] Query SQL retorna máximo 4 free_actions (1 por processo)
- [ ] Query SQL retorna 1 evidência por free_action (write-once)
- [ ] Print da tela recommendations mostra 10 itens com status corretos
- [ ] Print mostra tentativa de selecionar 2ª do mesmo processo falhando
- [ ] Print da tela free-action mostra COMPLETED + evidência read-only
- [ ] Print antes/depois do refresh mostra mesmo estado
- [ ] cURL GET recommendations retorna 200 com 10 itens
- [ ] cURL POST select retorna 201
- [ ] cURL POST evidence retorna 201 (primeira) e 409 (segunda)
- [ ] cURL GET free-action retorna 200 com COMPLETED
- [ ] Duas chamadas GET recommendations retornam mesmo resultado
- [ ] Logs do backend mostram geração apenas na primeira chamada

---

## 6. Script de Teste Completo

```bash
#!/bin/bash

# Configuração
export API_URL="http://localhost:3001"
export ASSESSMENT_ID="<assessment_id>"
export JWT_TOKEN="<token>"

echo "=== F3 AUDIT TEST ==="
echo ""

# 1. GET Recommendations (primeira vez - gera Top 10)
echo "1. GET /assessments/:id/recommendations (primeira chamada)"
RESPONSE1=$(curl -X GET "${API_URL}/assessments/${ASSESSMENT_ID}/recommendations" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -s)
echo "$RESPONSE1" | jq 'length' | xargs echo "  → Total de recomendações:"
REC_ID_1=$(echo "$RESPONSE1" | jq -r '.[0].recommendation_id')
echo "  → Primeira recommendation_id: $REC_ID_1"
echo ""

# 2. GET Recommendations (segunda vez - deve retornar do DB)
echo "2. GET /assessments/:id/recommendations (segunda chamada - determinismo)"
RESPONSE2=$(curl -X GET "${API_URL}/assessments/${ASSESSMENT_ID}/recommendations" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -s)
REC_ID_2=$(echo "$RESPONSE2" | jq -r '.[0].recommendation_id')
if [ "$REC_ID_1" == "$REC_ID_2" ]; then
  echo "  ✓ Determinismo OK: mesma recommendation_id na primeira posição"
else
  echo "  ✗ FALHA: recommendation_ids diferentes"
fi
echo ""

# 3. POST Select Free Action
echo "3. POST /assessments/:id/free-actions/select"
FREE_ACTION=$(curl -X POST "${API_URL}/assessments/${ASSESSMENT_ID}/free-actions/select" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"recommendation_id\": \"${REC_ID_1}\"}" \
  -s)
FREE_ACTION_ID=$(echo "$FREE_ACTION" | jq -r '.id')
echo "  → Free Action ID: $FREE_ACTION_ID"
echo "  → Status: $(echo "$FREE_ACTION" | jq -r '.status')"
echo ""

# 4. POST Evidence
echo "4. POST /free-actions/:id/evidence"
EVIDENCE_RESPONSE=$(curl -X POST "${API_URL}/free-actions/${FREE_ACTION_ID}/evidence" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"evidence_text": "Evidência de teste para auditoria F3"}' \
  -s -w "\nHTTP_STATUS:%{http_code}")
HTTP_STATUS=$(echo "$EVIDENCE_RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
if [ "$HTTP_STATUS" == "201" ]; then
  echo "  ✓ Evidência registrada (201)"
else
  echo "  ✗ FALHA: Status $HTTP_STATUS"
fi
echo ""

# 5. POST Evidence (segunda vez - write-once)
echo "5. POST /free-actions/:id/evidence (segunda vez - write-once)"
EVIDENCE_RESPONSE2=$(curl -X POST "${API_URL}/free-actions/${FREE_ACTION_ID}/evidence" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"evidence_text": "Tentativa de sobrescrever"}' \
  -s -w "\nHTTP_STATUS:%{http_code}")
HTTP_STATUS2=$(echo "$EVIDENCE_RESPONSE2" | grep "HTTP_STATUS" | cut -d: -f2)
if [ "$HTTP_STATUS2" == "409" ]; then
  echo "  ✓ Write-once OK: 409 retornado"
else
  echo "  ✗ FALHA: Esperado 409, recebido $HTTP_STATUS2"
fi
echo ""

# 6. GET Free Action
echo "6. GET /free-actions/:id"
FREE_ACTION_FULL=$(curl -X GET "${API_URL}/free-actions/${FREE_ACTION_ID}" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -s)
echo "  → Status: $(echo "$FREE_ACTION_FULL" | jq -r '.status')"
echo "  → Tem evidência: $(echo "$FREE_ACTION_FULL" | jq -r '.evidence != null')"
echo ""

echo "=== TESTE CONCLUÍDO ==="
```

---

## 7. Instruções para Captura de Prints

### 7.1 Tela Recommendations

1. Abrir navegador em modo anônimo (para evitar cache)
2. Fazer login
3. Navegar para `/recommendations?assessment_id=<id>`
4. Aguardar carregamento completo
5. Scroll para mostrar todas as 10 recomendações
6. Capturar screenshot completo
7. Verificar que aparecem:
   - 10 cards de recomendações
   - Ranks visíveis (#1 a #10)
   - Botões "Executar grátis" ou badges "Selecionada grátis" ou "Bloqueada"

### 7.2 Tentativa de selecionar 2ª do mesmo processo

1. Na tela recommendations, identificar duas recomendações do mesmo processo (ex: COMERCIAL)
2. Clicar em "Executar grátis" na primeira
3. Aguardar navegação para `/free-action/<id>`
4. Voltar para `/recommendations`
5. Tentar clicar em "Executar grátis" na segunda do mesmo processo
6. Capturar mensagem de erro: "já existe ação gratuita para o processo COMERCIAL"

### 7.3 Tela Free-Action com evidência

1. Navegar para `/free-action/<id>` após concluir evidência
2. Verificar que aparece:
   - Badge "✓ Concluída"
   - Checklist completo
   - Evidência em modo read-only (não editável)
   - Data de conclusão
3. Capturar screenshot completo

### 7.4 Refresh mantendo estado

1. Estar na tela `/free-action/<id>` com evidência registrada
2. Capturar screenshot (ANTES)
3. Pressionar F5
4. Aguardar recarregamento
5. Capturar screenshot (DEPOIS)
6. Comparar: devem ser idênticos

---

## 8. Notas Finais

- Todas as evidências devem ser coletadas com o mesmo `assessment_id`
- O token JWT deve ser válido durante toda a sessão de testes
- Os prints devem mostrar claramente os elementos solicitados
- As queries SQL devem ser executadas diretamente no banco (Supabase SQL Editor ou psql)
- Os cURL commands devem ser executados em sequência para manter contexto

## 9. Endpoints Relacionados

### F4B - Iniciativas FULL

Após completar o diagnóstico LIGHT e ter entitlement FULL, é possível acessar:
- `GET /full/assessments/:id/initiatives`: Ranking de iniciativas FULL (Top 10-12)

### Gate C - Visão Gerencial Estruturada

Endpoints para composição determinística de visão gerencial:
- `GET /full/assessments/:id/summary`: Resumo executivo (scores, critical gaps, top initiatives, dependencies, highlights)
- `GET /full/assessments/:id/next-best-actions`: Próximas melhores ações (ready_now vs blocked_by)

**Documentação:**
- `GATEC_NEXT_BEST_ACTIONS.md`: Documentação completa do endpoint next-best-actions
- `scripts/GATEC_EVIDENCE_README.md`: Guia dos scripts de evidência para Gate C
- `F4_DOCUMENTATION.md`: Documentação completa do F4, F4B e Gate C
