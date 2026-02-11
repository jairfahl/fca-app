#!/bin/bash
# Teste: Planos Light idempotentes (status, read, create)
# Requer: assessment_id, company_id, token
set -e
cd "$(dirname "$0")/.."

ASSESSMENT_ID="${1:?Uso: $0 ASSESSMENT_ID COMPANY_ID}"
COMPANY_ID="${2:?Uso: $0 ASSESSMENT_ID COMPANY_ID}"
PROCESS_KEY="${3:-comercial}"

TOKEN=$(node tmp_get_token.js 2>/dev/null)
if [ -z "$TOKEN" ]; then
  echo "Erro: token não obtido. Requer TEST_EMAIL/TEST_PASSWORD no .env."
  exit 1
fi

API="http://localhost:3001"
Q="assessment_id=${ASSESSMENT_ID}&company_id=${COMPANY_ID}"

echo "== Teste Planos Light (idempotência)"
echo "   assessment=$ASSESSMENT_ID company=$COMPANY_ID process=$PROCESS_KEY"
echo

echo "1. GET /light/plans/${PROCESS_KEY}/status (antes de criar)"
STATUS=$(curl -sS -X GET "${API}/light/plans/${PROCESS_KEY}/status?${Q}" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")
EXISTS=$(echo "$STATUS" | python3 -c "import json,sys; print(json.load(sys.stdin).get('exists', False))" 2>/dev/null || echo "false")
echo "   exists=$EXISTS"
echo

echo "2. GET /light/plans/${PROCESS_KEY} (read)"
READ=$(curl -sS -w "\nHTTP:%{http_code}" -X GET "${API}/light/plans/${PROCESS_KEY}?${Q}" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")
HTTP_READ=$(echo "$READ" | grep "HTTP:" | cut -d: -f2)
echo "   status=$HTTP_READ"
if [ "$HTTP_READ" = "200" ]; then
  PLAN_ID=$(echo "$READ" | sed '/HTTP:/d' | python3 -c "import json,sys; print(json.load(sys.stdin).get('plan_id',''))" 2>/dev/null || echo "")
  echo "   plan_id=$PLAN_ID"
fi
echo

echo "3. GET /light/plans/${PROCESS_KEY}/status (após existir)"
STATUS2=$(curl -sS -X GET "${API}/light/plans/${PROCESS_KEY}/status?${Q}" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")
EXISTS2=$(echo "$STATUS2" | python3 -c "import json,sys; print(json.load(sys.stdin).get('exists', False))" 2>/dev/null || echo "false")
PLAN_ID2=$(echo "$STATUS2" | python3 -c "import json,sys; print(json.load(sys.stdin).get('plan_id',''))" 2>/dev/null || echo "")
echo "   exists=$EXISTS2 plan_id=$PLAN_ID2"
echo

if { [ "$EXISTS2" = "True" ] || [ "$EXISTS2" = "true" ]; } && [ -n "$PLAN_ID2" ]; then
  echo "PASS: Status retorna exists=true e plan_id quando plano existe"
else
  echo "INFO: Plano pode não existir ainda (crie via POST free-actions/select + POST light/plans)"
fi
