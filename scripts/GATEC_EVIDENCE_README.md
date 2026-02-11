# Gate C Evidence Pack - Scripts de Teste

## Arquivos Criados

1. **`scripts/test-gatec-determinism.sh`** - Testa determinismo dos endpoints Gate C
2. **`scripts/test-gatec-entitlement.sh`** - Testa entitlement (FULL vs LIGHT)
3. **`scripts/run-gatec-evidence.sh`** - Script helper para executar ambos os testes

## Uso

### 1. Teste de Determinismo

```bash
cd ~/Downloads/fca-mtr

# Obter JWT token
export JWT=$(node tmp_get_token.js)

# Executar teste
./scripts/test-gatec-determinism.sh <company_id> <assessment_id> $JWT
```

**Exemplo:**
```bash
export JWT=$(node tmp_get_token.js)
./scripts/test-gatec-determinism.sh \
  136ced85-0c92-4127-b42e-568a18864b01 \
  <assessment_id> \
  $JWT
```

**Output esperado:**
```
=== GATE C: Test Determinism ===

Company ID: 136ced85-0c92-4127-b42e-568a18864b01
Assessment ID: <uuid>
API URL: http://localhost:3001

1. GET /full/assessments/:id/summary (call 1)...
✓ Status 200
   BODY_HASH_1: a1b2c3d4e5f6...

2. GET /full/assessments/:id/summary (call 2)...
✓ Status 200
   BODY_HASH_2: a1b2c3d4e5f6...

✓ SUMMARY: Determinism PASS (hashes iguais)

3. GET /full/assessments/:id/next-best-actions (call 1)...
✓ Status 200
   BODY_HASH_NBA_1: f6e5d4c3b2a1...

4. GET /full/assessments/:id/next-best-actions (call 2)...
✓ Status 200
   BODY_HASH_NBA_2: f6e5d4c3b2a1...

✓ NEXT-BEST-ACTIONS: Determinism PASS (hashes iguais)

=== Determinism Test PASSED ===

Summary:
  SUMMARY endpoint: BODY_HASH_1=a1b2c3d4e5f6..., BODY_HASH_2=a1b2c3d4e5f6...
  NEXT-BEST-ACTIONS endpoint: BODY_HASH_NBA_1=f6e5d4c3b2a1..., BODY_HASH_NBA_2=f6e5d4c3b2a1...
```

### 2. Teste de Entitlement

```bash
cd ~/Downloads/fca-mtr

# Obter JWTs (um com FULL, outro sem)
export JWT_FULL=$(node tmp_get_token.js)
export JWT_LIGHT=$(node tmp_get_token.js)  # user sem entitlement FULL

# Executar teste
./scripts/test-gatec-entitlement.sh \
  <company_id> \
  <assessment_id> \
  $JWT_FULL \
  $JWT_LIGHT
```

**Output esperado:**
```
=== GATE C: Test Entitlement ===

Company ID: 136ced85-0c92-4127-b42e-568a18864b01
Assessment ID: <uuid>
API URL: http://localhost:3001

1. GET /full/assessments/:id/summary (FULL entitlement)...
   Status: 200
✓ FULL entitlement: Status 200 OK
   BODY_HASH: a1b2c3d4e5f6...

2. GET /full/assessments/:id/summary (LIGHT/no entitlement)...
   Status: 403
✓ LIGHT/no entitlement: Status 403 (gate funcionando)
   Response: {"error":"conteúdo disponível apenas no FULL"}

3. GET /full/assessments/:id/next-best-actions (FULL entitlement)...
   Status: 200
✓ FULL entitlement: Status 200 OK
   BODY_HASH: f6e5d4c3b2a1...

4. GET /full/assessments/:id/next-best-actions (LIGHT/no entitlement)...
   Status: 403
✓ LIGHT/no entitlement: Status 403 (gate funcionando)
   Response: {"error":"conteúdo disponível apenas no FULL"}

=== Entitlement Test Summary ===

FULL entitlement:
  SUMMARY: Status 200, BODY_HASH=a1b2c3d4e5f6...
  NEXT-BEST-ACTIONS: Status 200, BODY_HASH=f6e5d4c3b2a1...

LIGHT/no entitlement:
  SUMMARY: Status 403
  NEXT-BEST-ACTIONS: Status 403

✓ Entitlement gate working: At least one endpoint returned 403 for non-FULL
✓ FULL entitlement: Both endpoints returned 200
```

### 3. Script Helper (Executa Ambos)

```bash
cd ~/Downloads/fca-mtr
./scripts/run-gatec-evidence.sh [company_id]
```

## Detalhes Técnicos

### Normalização de BODY

Os scripts removem o campo `generated_at` antes de calcular o hash:

```bash
BODY_NORM=$(cat response.json | jq -c 'del(.generated_at)')
BODY_HASH=$(echo -n "$BODY_NORM" | shasum -a 256 | cut -d' ' -f1)
```

Isso garante que comparações de determinismo não sejam afetadas por timestamps voláteis.

### Arquivos Temporários

Os scripts salvam respostas em `/tmp/`:
- `/tmp/gatec_summary_1.json` e `_2.json` (determinismo summary)
- `/tmp/gatec_nba_1.json` e `_2.json` (determinismo next-best-actions)
- `/tmp/gatec_ent_full_summary.json` (entitlement FULL summary)
- `/tmp/gatec_ent_light_summary.json` (entitlement LIGHT summary)
- `/tmp/gatec_ent_full_nba.json` (entitlement FULL next-best-actions)
- `/tmp/gatec_ent_light_nba.json` (entitlement LIGHT next-best-actions)

### Segurança

- **JWT não é logado** em arquivos permanentes
- Apenas hashes são exibidos no output
- Arquivos temporários podem ser limpos após os testes

## Validação

### Determinismo PASS se:
- `BODY_HASH_1 == BODY_HASH_2` para summary
- `BODY_HASH_NBA_1 == BODY_HASH_NBA_2` para next-best-actions
- Ambos os endpoints retornam 200

### Entitlement PASS se:
- FULL entitlement retorna 200 em ambos os endpoints
- LIGHT/no entitlement retorna 403 em pelo menos um endpoint
- Hashes são calculados corretamente para respostas FULL

## Troubleshooting

### Erro: "assessment_id não encontrado"
- Verifique se existe um assessment COMPLETED para a company
- Verifique se o JWT tem acesso à company

### Erro: "Status 401"
- Verifique se o JWT é válido
- Execute `node tmp_get_token.js` novamente

### Erro: "Status 403" mesmo com FULL
- Verifique se o entitlement FULL está ativo no banco:
  ```sql
  SELECT * FROM public.entitlements 
  WHERE user_id = '<user_id>' 
    AND company_id = '<company_id>' 
    AND plan = 'FULL' 
    AND status = 'ACTIVE';
  ```

### Erro: "Status 404"
- Verifique se o assessment_id existe
- Verifique se o assessment pertence à company_id
- Verifique se existe ranking em `full_assessment_initiatives`

## Documentação Relacionada

- `README.md`: Visão geral do projeto e todos os endpoints
- `F4_DOCUMENTATION.md`: Documentação completa do F4, F4B e Gate C
- `F3_CURL_EXAMPLES.md`: Exemplos de cURL para F3
- `GATEC_NEXT_BEST_ACTIONS.md`: Documentação do endpoint next-best-actions
- `GATEC_SCHEMA_FIXES.md`: Documentação dos ajustes de schema para robustez
- `scripts/FREE_ACTIONS_SELECT_IDEMPOTENT_EVIDENCE.md`: Evidência da idempotência do select F3
