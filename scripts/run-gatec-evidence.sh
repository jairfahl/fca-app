#!/bin/bash
# Helper script to run Gate C evidence tests
# Prepares data and executes both determinism and entitlement tests

set -e

cd "$(dirname "$0")/.."

echo "=== GATE C Evidence Pack ==="
echo ""

# 1. Get JWT token
echo "1. Obtendo JWT token..."
export JWT="$(node tmp_get_token.js 2>/dev/null || echo '')"
if [ -z "$JWT" ]; then
  echo "Erro: Não foi possível obter JWT token"
  echo "Verifique TEST_EMAIL e TEST_PASSWORD no .env"
  exit 1
fi
echo "✓ Token obtido"
echo ""

# 2. Get company_id (use known or from args)
COMPANY_ID="${1:-136ced85-0c92-4127-b42e-568a18864b01}"
echo "2. Company ID: $COMPANY_ID"
echo ""

# 3. Get assessment_id (most recent COMPLETED)
echo "3. Buscando assessment_id mais recente..."
ASSESSMENT_RESPONSE=$(curl -s "http://localhost:3001/assessments?company_id=${COMPANY_ID}" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" 2>/dev/null || echo "[]")

ASSESSMENT_ID=$(echo "$ASSESSMENT_RESPONSE" | node -e "
let d='';
process.stdin.on('data',c=>d+=c).on('end',()=>{
  try {
    const arr = JSON.parse(d);
    if (Array.isArray(arr) && arr.length > 0) {
      const completed = arr.find(a => a.status === 'COMPLETED');
      console.log(completed ? completed.id : (arr[0] ? arr[0].id : ''));
    }
  } catch(e) {}
});
")

if [ -z "$ASSESSMENT_ID" ]; then
  echo "Erro: Não foi possível obter assessment_id"
  echo "Resposta: $ASSESSMENT_RESPONSE"
  exit 1
fi

echo "✓ Assessment ID: $ASSESSMENT_ID"
echo ""

# 4. Run determinism test
echo "=== Running Determinism Test ==="
echo ""
./scripts/test-gatec-determinism.sh "$COMPANY_ID" "$ASSESSMENT_ID" "$JWT"
echo ""

# 5. Run entitlement test (using same JWT for both - in real scenario would use different users)
echo "=== Running Entitlement Test ==="
echo ""
echo "Nota: Usando mesmo JWT para FULL e LIGHT (em produção, usar JWTs diferentes)"
echo "Para testar corretamente, crie entitlement FULL para um user e use outro user sem entitlement"
echo ""
./scripts/test-gatec-entitlement.sh "$COMPANY_ID" "$ASSESSMENT_ID" "$JWT" "$JWT"
echo ""

echo "=== Evidence Pack Complete ==="
