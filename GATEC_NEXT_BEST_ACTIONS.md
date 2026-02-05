# Gate C: GET /full/assessments/:id/next-best-actions

## Objetivo

Entregar "o que fazer agora" sem criar plano novo, apenas compondo com base em dependências do catálogo.

## Contrato de Resposta

```json
{
  "ok": true,
  "summary_version": "C1",
  "data_sources": {
    "company_id": "<uuid>",
    "assessment_id": "<uuid>",
    "initiatives_ids": ["<uuid>", ...]
  },
  "ready_now": [
    {
      "rank": 1,
      "initiative_id": "<uuid>",
      "code": null,
      "title": "Título da iniciativa"
    }
  ],
  "blocked_by": [
    {
      "rank": 2,
      "initiative_id": "<uuid>",
      "code": null,
      "title": "Título da iniciativa",
      "blocked_reason": "DEPENDS_ON",
      "depends_on": [
        {
          "initiative_id": "<uuid>",
          "code": null,
          "title": "Título da dependência",
          "status": "NOT_DONE"
        }
      ]
    }
  ],
  "generated_at": "2026-01-30T12:00:00.000Z"
}
```

## Regras de Negócio

1. **Fonte de dados**: `full_assessment_initiatives` (rank 1..12) + join com `full_initiatives_catalog`
2. **Dependências**: Lidas de `dependencies_json` no catálogo
   - `[]` ou `null` → sem dependências → `ready_now`
   - Array de UUIDs → tem dependências → `blocked_by`
3. **Estado de execução**: Como não existe tabela de execução, todas as dependências são consideradas `NOT_DONE`
4. **Ordenação**:
   - `ready_now`: ordenado por `rank` ASC
   - `blocked_by`: ordenado por `rank` ASC
   - `depends_on`: ordenado por `initiative_id` ASC (determinístico)

## Endpoint

```
GET /full/assessments/:id/next-best-actions?company_id=<uuid>
```

### Headers

```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

### Parâmetros

- **Path**: `id` - UUID do assessment
- **Query**: `company_id` - UUID da company (obrigatório)

### Middleware

- `requireAuth`: Valida JWT
- `requireFullEntitlement`: Valida entitlement FULL/ACTIVE para `company_id`

## Status Codes

- **200**: Sucesso, retorna `ready_now` e `blocked_by`
- **400**: `company_id` ausente ou inválido
- **401**: Token ausente ou inválido
- **403**: Entitlement FULL não encontrado
- **404**: Assessment, company ou ranking não encontrados
- **500**: Erro inesperado

## Exemplos cURL

### 1. Sucesso (200 OK)

```bash
# Obter JWT token
export JWT="$(node tmp_get_token.js)"

# Definir IDs
export COMPANY_ID="136ced85-0c92-4127-b42e-568a18864b01"
export ASSESSMENT_ID="<uuid-do-assessment>"

# Chamar endpoint
curl -X GET "http://localhost:3001/full/assessments/${ASSESSMENT_ID}/next-best-actions?company_id=${COMPANY_ID}" \
  -H "Authorization: Bearer ${JWT}" \
  -H "Content-Type: application/json" \
  | jq .
```

**Resposta esperada (200):**
```json
{
  "ok": true,
  "summary_version": "C1",
  "data_sources": {
    "company_id": "136ced85-0c92-4127-b42e-568a18864b01",
    "assessment_id": "<uuid>",
    "initiatives_ids": ["<uuid1>", "<uuid2>", ...]
  },
  "ready_now": [
    {
      "rank": 1,
      "initiative_id": "<uuid>",
      "code": null,
      "title": "Mapeamento de jornada do cliente"
    },
    {
      "rank": 2,
      "initiative_id": "<uuid>",
      "code": null,
      "title": "Análise de pipeline de vendas"
    }
  ],
  "blocked_by": [],
  "generated_at": "2026-01-30T12:00:00.000Z"
}
```

**Nota**: Com o seed atual (todas as iniciativas têm `dependencies_json = []`), todas as iniciativas estarão em `ready_now` e nenhuma em `blocked_by`.

### 2. Sem entitlement FULL (403)

```bash
# Usar company_id sem entitlement FULL
curl -X GET "http://localhost:3001/full/assessments/${ASSESSMENT_ID}/next-best-actions?company_id=00000000-0000-0000-0000-000000000000" \
  -H "Authorization: Bearer ${JWT}" \
  -H "Content-Type: application/json"
```

**Resposta esperada (403):**
```json
{
  "error": "conteúdo disponível apenas no FULL"
}
```

### 3. Sem token (401)

```bash
curl -X GET "http://localhost:3001/full/assessments/${ASSESSMENT_ID}/next-best-actions?company_id=${COMPANY_ID}" \
  -H "Content-Type: application/json"
```

**Resposta esperada (401):**
```json
{
  "error": "missing token"
}
```

### 4. company_id ausente (400)

```bash
curl -X GET "http://localhost:3001/full/assessments/${ASSESSMENT_ID}/next-best-actions" \
  -H "Authorization: Bearer ${JWT}" \
  -H "Content-Type: application/json"
```

**Resposta esperada (400):**
```json
{
  "error": "company_id é obrigatório"
}
```

### 5. Assessment não encontrado (404)

```bash
curl -X GET "http://localhost:3001/full/assessments/00000000-0000-0000-0000-000000000000/next-best-actions?company_id=${COMPANY_ID}" \
  -H "Authorization: Bearer ${JWT}" \
  -H "Content-Type: application/json"
```

**Resposta esperada (404):**
```json
{
  "error": "assessment não encontrado ou não pertence à company"
}
```

## Script de Teste Automatizado

Execute o script de teste:

```bash
cd ~/Downloads/fca-mtr
./test-gatec-next-best-actions.sh [company_id]
```

O script testa:
1. ✅ Obtenção de JWT token
2. ✅ Busca de assessment_id
3. ✅ Chamada 200 OK com contagem de `ready_now` e `blocked_by`
4. ✅ Teste 403 (sem entitlement)
5. ✅ Teste 401 (sem token)

## Evidências

### Exemplo de Resposta com ready_now

```json
{
  "ok": true,
  "summary_version": "C1",
  "data_sources": {
    "company_id": "136ced85-0c92-4127-b42e-568a18864b01",
    "assessment_id": "abc123...",
    "initiatives_ids": ["uuid1", "uuid2", ...]
  },
  "ready_now": [
    {
      "rank": 1,
      "initiative_id": "uuid1",
      "code": null,
      "title": "Mapeamento de jornada do cliente"
    },
    {
      "rank": 2,
      "initiative_id": "uuid2",
      "code": null,
      "title": "Análise de pipeline de vendas"
    }
  ],
  "blocked_by": [],
  "generated_at": "2026-01-30T12:00:00.000Z"
}
```

### Exemplo de Resposta com blocked_by (quando houver dependências)

```json
{
  "ok": true,
  "summary_version": "C1",
  "data_sources": {
    "company_id": "136ced85-0c92-4127-b42e-568a18864b01",
    "assessment_id": "abc123...",
    "initiatives_ids": ["uuid1", "uuid2", "uuid3"]
  },
  "ready_now": [
    {
      "rank": 1,
      "initiative_id": "uuid1",
      "code": null,
      "title": "Iniciativa sem dependências"
    }
  ],
  "blocked_by": [
    {
      "rank": 2,
      "initiative_id": "uuid2",
      "code": null,
      "title": "Iniciativa com dependências",
      "blocked_reason": "DEPENDS_ON",
      "depends_on": [
        {
          "initiative_id": "uuid3",
          "code": null,
          "title": "Iniciativa dependente",
          "status": "NOT_DONE"
        }
      ]
    }
  ],
  "generated_at": "2026-01-30T12:00:00.000Z"
}
```

## Implementação

**Arquivo**: `apps/api/src/routes/gateC.js`

**Lógica**:
1. Valida ownership (company + assessment)
2. Busca ranking persistido (`full_assessment_initiatives`)
3. Busca dados do catálogo (`full_initiatives_catalog`)
4. Para cada iniciativa:
   - Se `dependencies_json` vazio/null → adiciona em `ready_now`
   - Se `dependencies_json` tem itens → adiciona em `blocked_by` com `depends_on`
5. Ordena arrays conforme regras determinísticas
6. Retorna JSON estruturado

## Observações

- **Determinismo**: A ordenação é sempre estável (por rank, depois por ID)
- **Refresh-safe**: Tudo vem do banco, sem estado em memória
- **Sem tabela de execução**: Todas as dependências são consideradas `NOT_DONE` até que seja implementada uma tabela de tracking
- **Campo `code`**: Atualmente retorna `null` pois não existe no catálogo; pode ser adicionado no futuro

## Scripts de Evidência

Para testar determinismo e entitlement:

```bash
# Teste de determinismo
./scripts/test-gatec-determinism.sh <company_id> <assessment_id> <jwt>

# Teste de entitlement
./scripts/test-gatec-entitlement.sh <company_id> <assessment_id> <jwt_full> <jwt_light>

# Helper (executa ambos)
./scripts/run-gatec-evidence.sh [company_id]
```

Ver `scripts/GATEC_EVIDENCE_README.md` para detalhes completos.

## Documentação Relacionada

- `README.md`: Visão geral do projeto e todos os endpoints
- `F4_DOCUMENTATION.md`: Documentação completa do F4, F4B e Gate C
- `GATEC_SCHEMA_FIXES.md`: Documentação dos ajustes de schema para robustez
- `scripts/GATEC_EVIDENCE_README.md`: Guia dos scripts de evidência
