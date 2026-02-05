# FULL Test Mode — Evidence Pack (BYPASS_DEV)

---

Ultima atualizacao: 2026-02-04.
## 1) Config usada (sem segredos)

```bash
NODE_ENV=development
FULL_ACCESS_MODE=BYPASS_DEV
```

## 2) cURLs (JWT válido) — provar 200

```bash
BASE=http://localhost:3001
JWT=<redacted>
ASSESSMENT_ID=db08789a-d6c1-4dbf-bded-4a717f790666
COMPANY_ID=136ced85-0c92-4127-b42e-568a18864b01
```

### 2.1 GET /full/diagnostic
```bash
curl -X GET "$BASE/full/diagnostic?company_id=$COMPANY_ID" \
  -H "Authorization: Bearer $JWT"
```

### 2.2 GET /full/assessments/:id/initiatives
```bash
curl -X GET "$BASE/full/assessments/$ASSESSMENT_ID/initiatives?company_id=$COMPANY_ID" \
  -H "Authorization: Bearer $JWT"
```

**Resultado obtido (2026-02-05):**
- HTTP 200
- `initiatives.length = 12` (rank 1..12)

### 2.3 GET /full/assessments/:id/summary
```bash
curl -X GET "$BASE/full/assessments/$ASSESSMENT_ID/summary?company_id=$COMPANY_ID" \
  -H "Authorization: Bearer $JWT"
```

**Resultado obtido (2026-02-05):**
- HTTP 200
- scores: `commercial=6`, `operations=6`, `admin_fin=8`, `management=6`, `overall=6.5`

### 2.4 GET /full/assessments/:id/next-best-actions
```bash
curl -X GET "$BASE/full/assessments/$ASSESSMENT_ID/next-best-actions?company_id=$COMPANY_ID" \
  -H "Authorization: Bearer $JWT"
```

**Resultado obtido (2026-02-05):**
- HTTP 200

## 3) Prova DB (12 ranks)

```sql
SELECT assessment_id, rank, initiative_id
FROM full_assessment_initiatives
WHERE assessment_id = 'db08789a-d6c1-4dbf-bded-4a717f790666'
ORDER BY rank ASC;
```

**Evidência esperada:**
- 12 linhas com `rank` = 1..12

**Resultado obtido (2026-02-05):**
- `count(*) = 12`

## 4) Prova determinismo (BODY normalizado)

### Initiatives
```bash
curl -s "$BASE/full/assessments/$ASSESSMENT_ID/initiatives?company_id=$COMPANY_ID" \
  -H "Authorization: Bearer $JWT" | jq -S . > /tmp/initiatives_1.json

curl -s "$BASE/full/assessments/$ASSESSMENT_ID/initiatives?company_id=$COMPANY_ID" \
  -H "Authorization: Bearer $JWT" | jq -S . > /tmp/initiatives_2.json

sha256sum /tmp/initiatives_1.json /tmp/initiatives_2.json
```

**Esperado:** `BODY_HASH1 == BODY_HASH2` (headers não contam)

### Summary
```bash
curl -s "$BASE/full/assessments/$ASSESSMENT_ID/summary?company_id=$COMPANY_ID" \
  -H "Authorization: Bearer $JWT" | jq -S . > /tmp/summary_1.json

curl -s "$BASE/full/assessments/$ASSESSMENT_ID/summary?company_id=$COMPANY_ID" \
  -H "Authorization: Bearer $JWT" | jq -S . > /tmp/summary_2.json

sha256sum /tmp/summary_1.json /tmp/summary_2.json
```

**Esperado:** `BODY_HASH1 == BODY_HASH2` (headers não contam)

## 5) Prova reversibilidade (ENFORCED)

```bash
NODE_ENV=development
FULL_ACCESS_MODE=ENFORCED
```

### 5.1 Sem entitlement → 403
```bash
curl -i "$BASE/full/diagnostic?company_id=$COMPANY_ID" \
  -H "Authorization: Bearer $JWT"
```

### 5.2 Com entitlement → 200 (se existir)
```bash
curl -i "$BASE/full/diagnostic?company_id=$COMPANY_ID" \
  -H "Authorization: Bearer $JWT"
```

## Prints

- [ ] Tela FULL /full/diagnostic com BYPASS_DEV
- [ ] Tela FULL /full/initiatives com BYPASS_DEV
- [ ] Tela FULL /full/summary com BYPASS_DEV
- [ ] Retorno 403 em ENFORCED sem entitlement
