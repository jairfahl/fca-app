#!/bin/bash
# Teste: POST /assessments/:id/free-actions/select deve ser idempotente
# 1ª chamada: 201 Created (ou 200 se já existir)
# 2ª chamada (mesmo processo): 200 OK com mesmo id
set -e
cd "$(dirname "$0")/.."
source .env 2>/dev/null || true

ASSESSMENT_ID="${1:?Uso: $0 ASSESSMENT_ID [recommendation_id]"}"
REC_ID="${2:-fallback-COMERCIAL}"

TOKEN=$(node tmp_get_token.js 2>/dev/null)
if [ -z "$TOKEN" ]; then
  echo "Erro: token não obtido. Requer TEST_EMAIL/TEST_PASSWORD no .env."
  exit 1
fi
echo "== Teste idempotência: POST /assessments/:id/free-actions/select"
echo "   assessment_id=$ASSESSMENT_ID recommendation_id=$REC_ID"
echo

echo "1ª chamada (esperado: 201):"
R1=$(curl -sS -w "\nHTTP_STATUS:%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/assessments/${ASSESSMENT_ID}/free-actions/select" \
  -d "{\"recommendation_id\":\"$REC_ID\"}")
HTTP1=$(echo "$R1" | grep "HTTP_STATUS:" | cut -d: -f2)
BODY1=$(echo "$R1" | sed '/HTTP_STATUS:/d')
ID1=$(echo "$BODY1" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null || echo "")
echo "   Status: $HTTP1"
echo "   id: $ID1"
echo

echo "2ª chamada (esperado: 200, mesmo id):"
R2=$(curl -sS -w "\nHTTP_STATUS:%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/assessments/${ASSESSMENT_ID}/free-actions/select" \
  -d "{\"recommendation_id\":\"$REC_ID\"}")
HTTP2=$(echo "$R2" | grep "HTTP_STATUS:" | cut -d: -f2)
BODY2=$(echo "$R2" | sed '/HTTP_STATUS:/d')
ID2=$(echo "$BODY2" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null || echo "")
echo "   Status: $HTTP2"
echo "   id: $ID2"
echo

if [ "$HTTP2" = "200" ] && [ "$ID1" = "$ID2" ] && [ -n "$ID1" ]; then
  echo "PASS: Idempotência OK (2ª=200, mesmo id em ambas)"
  exit 0
else
  echo "FAIL: Esperado 2ª=200, ids iguais. Obtido: 1ª=$HTTP1, 2ª=$HTTP2, id1=$ID1, id2=$ID2"
  exit 1
fi
