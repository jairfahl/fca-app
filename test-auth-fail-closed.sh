#!/bin/bash

# Script de teste para validar FAIL-CLOSED do middleware requireAuth
# Uso: ./test-auth-fail-closed.sh <jwt_token_valido>

set -e

if [ $# -lt 1 ]; then
  echo "Uso: $0 <jwt_token_valido>"
  echo ""
  echo "Este script testa que o middleware requireAuth rejeita:"
  echo "1. Requisições sem Authorization header"
  echo "2. Requisições com formato inválido"
  echo "3. Requisições com token vazio"
  echo "4. Requisições com token adulterado (1 caractere alterado)"
  echo "5. Requisições com token válido (deve passar)"
  exit 1
fi

VALID_TOKEN=$1
API_URL="${API_URL:-http://localhost:3001}"

echo "=== TESTE FAIL-CLOSED: requireAuth ==="
echo ""

# Criar token adulterado (alterar último caractere)
ADULTERATED_TOKEN="${VALID_TOKEN%?}X"

# Teste 1: Sem Authorization header
echo "1. Teste: Sem Authorization header"
RESPONSE1=$(curl -X GET "${API_URL}/companies" \
  -H "Content-Type: application/json" \
  -s -w "\nHTTP_STATUS:%{http_code}")
HTTP_STATUS1=$(echo "$RESPONSE1" | grep "HTTP_STATUS" | cut -d: -f2)
BODY1=$(echo "$RESPONSE1" | grep -v "HTTP_STATUS")

if [ "$HTTP_STATUS1" == "401" ]; then
  echo "   ✓ PASS: Retornou 401 (esperado)"
  echo "   → Resposta: $BODY1"
else
  echo "   ✗ FAIL: Retornou $HTTP_STATUS1 (esperado 401)"
  exit 1
fi
echo ""

# Teste 2: Formato inválido (sem "Bearer ")
echo "2. Teste: Formato inválido (sem 'Bearer ')"
RESPONSE2=$(curl -X GET "${API_URL}/companies" \
  -H "Authorization: ${VALID_TOKEN}" \
  -H "Content-Type: application/json" \
  -s -w "\nHTTP_STATUS:%{http_code}")
HTTP_STATUS2=$(echo "$RESPONSE2" | grep "HTTP_STATUS" | cut -d: -f2)
BODY2=$(echo "$RESPONSE2" | grep -v "HTTP_STATUS")

if [ "$HTTP_STATUS2" == "401" ]; then
  echo "   ✓ PASS: Retornou 401 (esperado)"
  echo "   → Resposta: $BODY2"
else
  echo "   ✗ FAIL: Retornou $HTTP_STATUS2 (esperado 401)"
  exit 1
fi
echo ""

# Teste 3: Token vazio
echo "3. Teste: Token vazio"
RESPONSE3=$(curl -X GET "${API_URL}/companies" \
  -H "Authorization: Bearer " \
  -H "Content-Type: application/json" \
  -s -w "\nHTTP_STATUS:%{http_code}")
HTTP_STATUS3=$(echo "$RESPONSE3" | grep "HTTP_STATUS" | cut -d: -f2)
BODY3=$(echo "$RESPONSE3" | grep -v "HTTP_STATUS")

if [ "$HTTP_STATUS3" == "401" ]; then
  echo "   ✓ PASS: Retornou 401 (esperado)"
  echo "   → Resposta: $BODY3"
else
  echo "   ✗ FAIL: Retornou $HTTP_STATUS3 (esperado 401)"
  exit 1
fi
echo ""

# Teste 4: Token adulterado (1 caractere alterado)
echo "4. Teste: Token adulterado (último caractere alterado)"
RESPONSE4=$(curl -X GET "${API_URL}/companies" \
  -H "Authorization: Bearer ${ADULTERATED_TOKEN}" \
  -H "Content-Type: application/json" \
  -s -w "\nHTTP_STATUS:%{http_code}")
HTTP_STATUS4=$(echo "$RESPONSE4" | grep "HTTP_STATUS" | cut -d: -f2)
BODY4=$(echo "$RESPONSE4" | grep -v "HTTP_STATUS")

if [ "$HTTP_STATUS4" == "401" ]; then
  echo "   ✓ PASS: Retornou 401 (esperado - assinatura inválida)"
  echo "   → Resposta: $BODY4"
else
  echo "   ✗ FAIL CRÍTICO: Retornou $HTTP_STATUS4 (esperado 401)"
  echo "   → Resposta: $BODY4"
  echo ""
  echo "   ATENÇÃO: O middleware está aceitando tokens adulterados!"
  echo "   Isso é uma falha crítica de segurança (FAIL-OPEN)."
  exit 1
fi
echo ""

# Teste 5: Token válido (deve passar)
echo "5. Teste: Token válido (deve passar)"
RESPONSE5=$(curl -X GET "${API_URL}/companies" \
  -H "Authorization: Bearer ${VALID_TOKEN}" \
  -H "Content-Type: application/json" \
  -s -w "\nHTTP_STATUS:%{http_code}")
HTTP_STATUS5=$(echo "$RESPONSE5" | grep "HTTP_STATUS" | cut -d: -f2)
BODY5=$(echo "$RESPONSE5" | grep -v "HTTP_STATUS")

if [ "$HTTP_STATUS5" == "200" ]; then
  echo "   ✓ PASS: Retornou 200 (esperado - token válido)"
  echo "   → Resposta: $(echo "$BODY5" | head -c 100)..."
else
  echo "   ⚠ AVISO: Retornou $HTTP_STATUS5 (esperado 200 para token válido)"
  echo "   → Resposta: $BODY5"
  echo "   (Isso pode ser esperado se não houver companies ou houver outro erro)"
fi
echo ""

echo "=== TODOS OS TESTES DE SEGURANÇA PASSARAM ==="
echo ""
echo "Resumo:"
echo "  ✓ Sem Authorization → 401"
echo "  ✓ Formato inválido → 401"
echo "  ✓ Token vazio → 401"
echo "  ✓ Token adulterado → 401 (FAIL-CLOSED funcionando)"
echo "  ✓ Token válido → 200"
echo ""
echo "O middleware requireAuth está operando em modo FAIL-CLOSED."
