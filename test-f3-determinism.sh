#!/bin/bash

# Script de teste de determinismo F3
# Uso: ./test-f3-determinism.sh <assessment_id> <jwt_token>

set -e

if [ $# -lt 2 ]; then
  echo "Uso: $0 <assessment_id> <jwt_token>"
  exit 1
fi

ASSESSMENT_ID=$1
JWT_TOKEN=$2
API_URL="${API_URL:-http://localhost:3001}"

echo "=== TESTE DE DETERMINISMO F3 ==="
echo "Assessment ID: $ASSESSMENT_ID"
echo ""

# Primeira chamada
echo "1. Primeira chamada GET /assessments/:id/recommendations"
RESPONSE1=$(curl -X GET "${API_URL}/assessments/${ASSESSMENT_ID}/recommendations" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -s)

COUNT1=$(echo "$RESPONSE1" | jq 'length')
echo "   → Total de recomendações: $COUNT1"

# Extrair ranks e recommendation_ids
echo "$RESPONSE1" | jq -r '.[] | "\(.rank)|\(.recommendation_id)|\(.process)"' > /tmp/f3_call1.txt
echo "   → Primeiras 3 recomendações:"
head -3 /tmp/f3_call1.txt | sed 's/^/      /'
echo ""

# Segunda chamada (deve retornar o mesmo resultado)
echo "2. Segunda chamada GET /assessments/:id/recommendations"
RESPONSE2=$(curl -X GET "${API_URL}/assessments/${ASSESSMENT_ID}/recommendations" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -s)

COUNT2=$(echo "$RESPONSE2" | jq 'length')
echo "   → Total de recomendações: $COUNT2"

# Extrair ranks e recommendation_ids
echo "$RESPONSE2" | jq -r '.[] | "\(.rank)|\(.recommendation_id)|\(.process)"' > /tmp/f3_call2.txt
echo "   → Primeiras 3 recomendações:"
head -3 /tmp/f3_call2.txt | sed 's/^/      /'
echo ""

# Comparação
echo "3. Comparação"
if diff -q /tmp/f3_call1.txt /tmp/f3_call2.txt > /dev/null 2>&1; then
  echo "   ✓ SUCESSO: As duas chamadas retornaram o mesmo resultado"
  echo ""
  echo "   Detalhes:"
  echo "   - Mesmo número de recomendações: $COUNT1"
  echo "   - Mesmos recommendation_ids na mesma ordem"
  echo "   - Mesmos ranks"
  echo ""
  echo "   Evidência de determinismo:"
  echo "   Rank | Recommendation ID | Process"
  echo "   -----|-------------------|--------"
  cat /tmp/f3_call1.txt | head -5 | sed 's/|/ | /g' | sed 's/^/   /'
else
  echo "   ✗ FALHA: As chamadas retornaram resultados diferentes"
  echo ""
  echo "   Diferenças encontradas:"
  diff /tmp/f3_call1.txt /tmp/f3_call2.txt || true
  exit 1
fi

# Limpeza
rm -f /tmp/f3_call1.txt /tmp/f3_call2.txt

echo ""
echo "=== TESTE CONCLUÍDO COM SUCESSO ==="
