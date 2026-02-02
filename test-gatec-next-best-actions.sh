#!/bin/bash
# Test script for GET /full/assessments/:id/next-best-actions (Gate C)

set -e

cd "$(dirname "$0")"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=== GATE C: Test GET /full/assessments/:id/next-best-actions ==="
echo ""

# 1) Get JWT token
echo "1. Obtendo JWT token..."
export JWT="$(node tmp_get_token.js 2>/dev/null || echo '')"
if [ -z "$JWT" ]; then
  echo -e "${RED}✗ Erro: Não foi possível obter JWT token${NC}"
  echo "   Verifique TEST_EMAIL e TEST_PASSWORD no .env"
  exit 1
fi
echo -e "${GREEN}✓ Token obtido${NC}"
echo ""

# 2) Get company_id (use known company_id from previous tests)
COMPANY_ID="${1:-136ced85-0c92-4127-b42e-568a18864b01}"
echo "2. Usando company_id: $COMPANY_ID"
echo ""

# 3) Get assessment_id (most recent COMPLETED assessment)
echo "3. Buscando assessment_id mais recente..."
ASSESSMENT_RESPONSE=$(curl -s "http://localhost:3001/assessments?company_id=${COMPANY_ID}" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json")

ASSESSMENT_ID=$(echo "$ASSESSMENT_RESPONSE" | node -e "
let d='';
process.stdin.on('data',c=>d+=c).on('end',()=>{
  try {
    const arr = JSON.parse(d);
    if (Array.isArray(arr) && arr.length > 0) {
      // Find COMPLETED assessment
      const completed = arr.find(a => a.status === 'COMPLETED');
      console.log(completed ? completed.id : (arr[0] ? arr[0].id : ''));
    }
  } catch(e) {}
});
")

if [ -z "$ASSESSMENT_ID" ]; then
  echo -e "${RED}✗ Erro: Não foi possível obter assessment_id${NC}"
  echo "   Resposta: $ASSESSMENT_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✓ Assessment ID: $ASSESSMENT_ID${NC}"
echo ""

# 4) Test 200 (success)
echo "4. Testando GET /full/assessments/:id/next-best-actions (200 OK)..."
RESPONSE=$(curl -s -w "\n%{http_code}" "http://localhost:3001/full/assessments/${ASSESSMENT_ID}/next-best-actions?company_id=${COMPANY_ID}" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✓ Status 200 OK${NC}"
  
  # Parse and display ready_now count
  READY_COUNT=$(echo "$BODY" | node -e "
let d='';
process.stdin.on('data',c=>d+=c).on('end',()=>{
  try {
    const j = JSON.parse(d);
    console.log((j.ready_now || []).length);
  } catch(e) { console.log('0'); }
});
")
  
  # Parse and display blocked_by count
  BLOCKED_COUNT=$(echo "$BODY" | node -e "
let d='';
process.stdin.on('data',c=>d+=c).on('end',()=>{
  try {
    const j = JSON.parse(d);
    console.log((j.blocked_by || []).length);
  } catch(e) { console.log('0'); }
});
")
  
  echo "   → ready_now: $READY_COUNT iniciativas"
  echo "   → blocked_by: $BLOCKED_COUNT iniciativas"
  echo ""
  echo "   Payload (primeiros 500 caracteres):"
  echo "$BODY" | head -c 500
  echo "..."
  echo ""
else
  echo -e "${RED}✗ Status $HTTP_CODE (esperado 200)${NC}"
  echo "   Resposta: $BODY"
  exit 1
fi

# 5) Test 403 (no FULL entitlement)
echo "5. Testando GET /full/assessments/:id/next-best-actions sem entitlement FULL (403)..."
# Use a different company_id that doesn't have FULL entitlement
TEST_COMPANY_ID="00000000-0000-0000-0000-000000000000"
RESPONSE_403=$(curl -s -w "\n%{http_code}" "http://localhost:3001/full/assessments/${ASSESSMENT_ID}/next-best-actions?company_id=${TEST_COMPANY_ID}" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json")

HTTP_CODE_403=$(echo "$RESPONSE_403" | tail -n1)
BODY_403=$(echo "$RESPONSE_403" | head -n-1)

if [ "$HTTP_CODE_403" = "403" ] || [ "$HTTP_CODE_403" = "404" ]; then
  echo -e "${GREEN}✓ Status $HTTP_CODE_403 (esperado 403 ou 404)${NC}"
  echo "   Resposta: $BODY_403"
else
  echo -e "${YELLOW}⚠ Status $HTTP_CODE_403 (pode ser 404 se company não existe)${NC}"
  echo "   Resposta: $BODY_403"
fi
echo ""

# 6) Test 401 (no token)
echo "6. Testando GET /full/assessments/:id/next-best-actions sem token (401)..."
RESPONSE_401=$(curl -s -w "\n%{http_code}" "http://localhost:3001/full/assessments/${ASSESSMENT_ID}/next-best-actions?company_id=${COMPANY_ID}" \
  -H "Content-Type: application/json")

HTTP_CODE_401=$(echo "$RESPONSE_401" | tail -n1)
BODY_401=$(echo "$RESPONSE_401" | head -n-1)

if [ "$HTTP_CODE_401" = "401" ]; then
  echo -e "${GREEN}✓ Status 401 OK${NC}"
  echo "   Resposta: $BODY_401"
else
  echo -e "${RED}✗ Status $HTTP_CODE_401 (esperado 401)${NC}"
  echo "   Resposta: $BODY_401"
fi
echo ""

echo -e "${GREEN}=== Testes concluídos ===${NC}"
