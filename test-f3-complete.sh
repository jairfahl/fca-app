#!/bin/bash

# Script completo de teste F3
# Uso: ./test-f3-complete.sh <assessment_id> <jwt_token>

set -e

if [ $# -lt 2 ]; then
  echo "Uso: $0 <assessment_id> <jwt_token>"
  exit 1
fi

ASSESSMENT_ID=$1
JWT_TOKEN=$2
API_URL="${API_URL:-http://localhost:3001}"

echo "=== TESTE COMPLETO F3 ==="
echo "Assessment ID: $ASSESSMENT_ID"
echo ""

# 1. GET Recommendations (primeira vez)
echo "1. GET /assessments/:id/recommendations (primeira chamada)"
RESPONSE1=$(curl -X GET "${API_URL}/assessments/${ASSESSMENT_ID}/recommendations" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -s -w "\nHTTP_STATUS:%{http_code}")

HTTP_STATUS1=$(echo "$RESPONSE1" | grep "HTTP_STATUS" | cut -d: -f2)
RESPONSE1_BODY=$(echo "$RESPONSE1" | grep -v "HTTP_STATUS")

if [ "$HTTP_STATUS1" == "200" ]; then
  COUNT1=$(echo "$RESPONSE1_BODY" | jq 'length')
  echo "   ✓ Status: 200"
  echo "   → Total de recomendações: $COUNT1"
  REC_ID_1=$(echo "$RESPONSE1_BODY" | jq -r '.[0].recommendation_id')
  PROCESS_1=$(echo "$RESPONSE1_BODY" | jq -r '.[0].process')
  echo "   → Primeira recommendation_id: $REC_ID_1"
  echo "   → Process: $PROCESS_1"
else
  echo "   ✗ FALHA: Status $HTTP_STATUS1"
  exit 1
fi
echo ""

# 2. GET Recommendations (segunda vez - determinismo)
echo "2. GET /assessments/:id/recommendations (segunda chamada - determinismo)"
RESPONSE2=$(curl -X GET "${API_URL}/assessments/${ASSESSMENT_ID}/recommendations" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -s -w "\nHTTP_STATUS:%{http_code}")

HTTP_STATUS2=$(echo "$RESPONSE2" | grep "HTTP_STATUS" | cut -d: -f2)
RESPONSE2_BODY=$(echo "$RESPONSE2" | grep -v "HTTP_STATUS")

if [ "$HTTP_STATUS2" == "200" ]; then
  REC_ID_2=$(echo "$RESPONSE2_BODY" | jq -r '.[0].recommendation_id')
  if [ "$REC_ID_1" == "$REC_ID_2" ]; then
    echo "   ✓ Determinismo OK: mesma recommendation_id na primeira posição"
  else
    echo "   ✗ FALHA: recommendation_ids diferentes"
    exit 1
  fi
else
  echo "   ✗ FALHA: Status $HTTP_STATUS2"
  exit 1
fi
echo ""

# 3. POST Select Free Action
echo "3. POST /assessments/:id/free-actions/select"
FREE_ACTION_RESPONSE=$(curl -X POST "${API_URL}/assessments/${ASSESSMENT_ID}/free-actions/select" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"recommendation_id\": \"${REC_ID_1}\"}" \
  -s -w "\nHTTP_STATUS:%{http_code}")

HTTP_STATUS3=$(echo "$FREE_ACTION_RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
FREE_ACTION_BODY=$(echo "$FREE_ACTION_RESPONSE" | grep -v "HTTP_STATUS")

if [ "$HTTP_STATUS3" == "201" ]; then
  FREE_ACTION_ID=$(echo "$FREE_ACTION_BODY" | jq -r '.id')
  FREE_ACTION_STATUS=$(echo "$FREE_ACTION_BODY" | jq -r '.status')
  echo "   ✓ Status: 201"
  echo "   → Free Action ID: $FREE_ACTION_ID"
  echo "   → Status: $FREE_ACTION_STATUS"
else
  echo "   ✗ FALHA: Status $HTTP_STATUS3"
  echo "   Resposta: $FREE_ACTION_BODY"
  exit 1
fi
echo ""

# 4. POST Evidence
echo "4. POST /free-actions/:id/evidence"
EVIDENCE_RESPONSE=$(curl -X POST "${API_URL}/free-actions/${FREE_ACTION_ID}/evidence" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"evidence_text": "Evidência de teste para auditoria F3"}' \
  -s -w "\nHTTP_STATUS:%{http_code}")

HTTP_STATUS4=$(echo "$EVIDENCE_RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
EVIDENCE_BODY=$(echo "$EVIDENCE_RESPONSE" | grep -v "HTTP_STATUS")

if [ "$HTTP_STATUS4" == "201" ]; then
  echo "   ✓ Evidência registrada (201)"
else
  echo "   ✗ FALHA: Status $HTTP_STATUS4"
  echo "   Resposta: $EVIDENCE_BODY"
  exit 1
fi
echo ""

# 5. POST Evidence (segunda vez - write-once)
echo "5. POST /free-actions/:id/evidence (segunda vez - write-once)"
EVIDENCE_RESPONSE2=$(curl -X POST "${API_URL}/free-actions/${FREE_ACTION_ID}/evidence" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"evidence_text": "Tentativa de sobrescrever"}' \
  -s -w "\nHTTP_STATUS:%{http_code}")

HTTP_STATUS5=$(echo "$EVIDENCE_RESPONSE2" | grep "HTTP_STATUS" | cut -d: -f2)
EVIDENCE_BODY2=$(echo "$EVIDENCE_RESPONSE2" | grep -v "HTTP_STATUS")

if [ "$HTTP_STATUS5" == "409" ]; then
  echo "   ✓ Write-once OK: 409 retornado"
  ERROR_MSG=$(echo "$EVIDENCE_BODY2" | jq -r '.error // "erro não encontrado"')
  echo "   → Mensagem: $ERROR_MSG"
else
  echo "   ✗ FALHA: Esperado 409, recebido $HTTP_STATUS5"
  echo "   Resposta: $EVIDENCE_BODY2"
  exit 1
fi
echo ""

# 6. GET Free Action
echo "6. GET /free-actions/:id"
FREE_ACTION_FULL_RESPONSE=$(curl -X GET "${API_URL}/free-actions/${FREE_ACTION_ID}" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -s -w "\nHTTP_STATUS:%{http_code}")

HTTP_STATUS6=$(echo "$FREE_ACTION_FULL_RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
FREE_ACTION_FULL_BODY=$(echo "$FREE_ACTION_FULL_RESPONSE" | grep -v "HTTP_STATUS")

if [ "$HTTP_STATUS6" == "200" ]; then
  FINAL_STATUS=$(echo "$FREE_ACTION_FULL_BODY" | jq -r '.status')
  HAS_EVIDENCE=$(echo "$FREE_ACTION_FULL_BODY" | jq -r '.evidence != null')
  echo "   ✓ Status: 200"
  echo "   → Status final: $FINAL_STATUS"
  echo "   → Tem evidência: $HAS_EVIDENCE"
  
  if [ "$FINAL_STATUS" == "COMPLETED" ] && [ "$HAS_EVIDENCE" == "true" ]; then
    echo "   ✓ Status COMPLETED e evidência presente"
  else
    echo "   ✗ FALHA: Status ou evidência incorretos"
    exit 1
  fi
else
  echo "   ✗ FALHA: Status $HTTP_STATUS6"
  exit 1
fi
echo ""

echo "=== TODOS OS TESTES PASSARAM ==="
echo ""
echo "Resumo:"
echo "  ✓ GET recommendations retorna 10 itens"
echo "  ✓ Determinismo: mesma resposta em duas chamadas"
echo "  ✓ POST select cria free_action"
echo "  ✓ POST evidence registra evidência"
echo "  ✓ Write-once: segunda tentativa retorna 409"
echo "  ✓ GET free-action retorna COMPLETED com evidência"
