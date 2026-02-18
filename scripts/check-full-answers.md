# Checagem de respostas FULL (full_answers)

Script/manual para validar que as respostas do diagnóstico FULL estão persistidas corretamente no BD.

## Pré-requisitos

- API rodando (ex: `http://localhost:3001`)
- JWT válido (ex: `node tmp_get_token.js` com `fca@fca.com`)
- `company_id` e `assessment_id` do diagnóstico FULL

## Passos

### 1. Obter token e company_id

```bash
export JWT=$(node tmp_get_token.js)
# ou para fca@fca.com: configure em .env FIRST_USER_EMAIL=fca@fca.com

curl -s "$API/companies" -H "Authorization: Bearer $JWT" | jq '.[0].id'
export COMPANY_ID="<id retornado>"
```

### 2. Obter assessment_id (diagnóstico FULL)

```bash
# Via endpoint current (retorna o assessment atual)
curl -s "$API/full/assessments/current?company_id=$COMPANY_ID" \
  -H "Authorization: Bearer $JWT" | jq '.id'

# ou via start (se não houver current)
curl -s -X POST "$API/full/assessments/start" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d "{\"company_id\":\"$COMPANY_ID\",\"segment\":\"C\"}" | jq '.assessment_id'

export ASSESSMENT_ID="<id retornado>"
```

### 3. Chamar GET /full/answers e validar count > 0

```bash
curl -s "$API/full/answers?assessment_id=$ASSESSMENT_ID&company_id=$COMPANY_ID" \
  -H "Authorization: Bearer $JWT" | jq '.count, .answers | length'
```

**Validação:** `count` deve ser > 0 (número de respostas salvas).

### 4. Alternativa: GET /full/assessments/:id/answers

```bash
curl -s "$API/full/assessments/$ASSESSMENT_ID/answers?company_id=$COMPANY_ID" \
  -H "Authorization: Bearer $JWT" | jq '.count, .answers | length'
```

## Critérios de aceitação

- Com `fca@fca.com`, após responder perguntas no wizard:
  - refresh na página mantém "Respostas salvas: X"
  - `GET /full/answers?assessment_id=...&company_id=...` retorna `count: X` e `answers` com X itens
- Após concluir 3/3 e iniciar novo ciclo:
  - respostas continuam lá (não somem)
  - ações continuam sugeridas sem DIAG_NOT_READY

## Logs de auditoria

Os endpoints emitem:

- `[AUDIT] full_answer_save assessment_id=... user=... company=... count=...` ao salvar
- `[AUDIT] full_answers_load assessment_id=... count=...` ao carregar
