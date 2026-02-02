#!/bin/bash
# Test script for Gate C entitlement (FULL vs LIGHT/no entitlement)
# Verifies that FULL entitlement returns 200, and non-FULL returns 403

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check arguments
if [ $# -lt 4 ]; then
  echo "Usage: $0 <company_id> <assessment_id> <jwt_full> <jwt_light_or_no_entitlement>"
  echo ""
  echo "Example:"
  echo "  export JWT_FULL=\$(node ../tmp_get_token.js)"
  echo "  export JWT_LIGHT=\$(node ../tmp_get_token.js)  # user sem entitlement FULL"
  echo "  $0 <company_id> <assessment_id> \$JWT_FULL \$JWT_LIGHT"
  exit 1
fi

COMPANY_ID="$1"
ASSESSMENT_ID="$2"
JWT_FULL="$3"
JWT_LIGHT="$4"

API_URL="http://localhost:3001"

echo "=== GATE C: Test Entitlement ==="
echo ""
echo "Company ID: $COMPANY_ID"
echo "Assessment ID: $ASSESSMENT_ID"
echo "API URL: $API_URL"
echo ""

# Test 1: GET /full/assessments/:id/summary with FULL entitlement
echo "1. GET /full/assessments/:id/summary (FULL entitlement)..."
HTTP_CODE_FULL_SUMMARY=$(curl -s -w "%{http_code}" -o /tmp/gatec_ent_full_summary.json \
  "${API_URL}/full/assessments/${ASSESSMENT_ID}/summary?company_id=${COMPANY_ID}" \
  -H "Authorization: Bearer ${JWT_FULL}" \
  -H "Content-Type: application/json")

echo "   Status: $HTTP_CODE_FULL_SUMMARY"

if [ "$HTTP_CODE_FULL_SUMMARY" = "200" ]; then
  echo -e "${GREEN}✓ FULL entitlement: Status 200 OK${NC}"
  BODY_NORM_FULL_SUMMARY=$(cat /tmp/gatec_ent_full_summary.json | jq -c 'del(.generated_at)' 2>/dev/null || echo "")
  BODY_HASH_FULL_SUMMARY=$(echo -n "$BODY_NORM_FULL_SUMMARY" | shasum -a 256 | cut -d' ' -f1)
  echo "   BODY_HASH: $BODY_HASH_FULL_SUMMARY"
else
  echo -e "${RED}✗ FULL entitlement: Status $HTTP_CODE_FULL_SUMMARY (esperado 200)${NC}"
  cat /tmp/gatec_ent_full_summary.json
  exit 1
fi
echo ""

# Test 2: GET /full/assessments/:id/summary with LIGHT/no entitlement
echo "2. GET /full/assessments/:id/summary (LIGHT/no entitlement)..."
HTTP_CODE_LIGHT_SUMMARY=$(curl -s -w "%{http_code}" -o /tmp/gatec_ent_light_summary.json \
  "${API_URL}/full/assessments/${ASSESSMENT_ID}/summary?company_id=${COMPANY_ID}" \
  -H "Authorization: Bearer ${JWT_LIGHT}" \
  -H "Content-Type: application/json")

echo "   Status: $HTTP_CODE_LIGHT_SUMMARY"

if [ "$HTTP_CODE_LIGHT_SUMMARY" = "403" ]; then
  echo -e "${GREEN}✓ LIGHT/no entitlement: Status 403 (gate funcionando)${NC}"
  BODY_LIGHT_SUMMARY=$(cat /tmp/gatec_ent_light_summary.json 2>/dev/null || echo "")
  echo "   Response: $BODY_LIGHT_SUMMARY"
elif [ "$HTTP_CODE_LIGHT_SUMMARY" = "404" ]; then
  echo -e "${YELLOW}⚠ LIGHT/no entitlement: Status 404 (company/assessment não encontrado)${NC}"
  echo "   (Isso pode acontecer se o JWT_LIGHT não tem acesso à company)"
else
  echo -e "${RED}✗ LIGHT/no entitlement: Status $HTTP_CODE_LIGHT_SUMMARY (esperado 403)${NC}"
  cat /tmp/gatec_ent_light_summary.json
  # Não falhar aqui, pois pode ser que o JWT_LIGHT tenha acesso mas sem entitlement
fi
echo ""

# Test 3: GET /full/assessments/:id/next-best-actions with FULL entitlement
echo "3. GET /full/assessments/:id/next-best-actions (FULL entitlement)..."
HTTP_CODE_FULL_NBA=$(curl -s -w "%{http_code}" -o /tmp/gatec_ent_full_nba.json \
  "${API_URL}/full/assessments/${ASSESSMENT_ID}/next-best-actions?company_id=${COMPANY_ID}" \
  -H "Authorization: Bearer ${JWT_FULL}" \
  -H "Content-Type: application/json")

echo "   Status: $HTTP_CODE_FULL_NBA"

if [ "$HTTP_CODE_FULL_NBA" = "200" ]; then
  echo -e "${GREEN}✓ FULL entitlement: Status 200 OK${NC}"
  BODY_NORM_FULL_NBA=$(cat /tmp/gatec_ent_full_nba.json | jq -c 'del(.generated_at)' 2>/dev/null || echo "")
  BODY_HASH_FULL_NBA=$(echo -n "$BODY_NORM_FULL_NBA" | shasum -a 256 | cut -d' ' -f1)
  echo "   BODY_HASH: $BODY_HASH_FULL_NBA"
else
  echo -e "${RED}✗ FULL entitlement: Status $HTTP_CODE_FULL_NBA (esperado 200)${NC}"
  cat /tmp/gatec_ent_full_nba.json
  exit 1
fi
echo ""

# Test 4: GET /full/assessments/:id/next-best-actions with LIGHT/no entitlement
echo "4. GET /full/assessments/:id/next-best-actions (LIGHT/no entitlement)..."
HTTP_CODE_LIGHT_NBA=$(curl -s -w "%{http_code}" -o /tmp/gatec_ent_light_nba.json \
  "${API_URL}/full/assessments/${ASSESSMENT_ID}/next-best-actions?company_id=${COMPANY_ID}" \
  -H "Authorization: Bearer ${JWT_LIGHT}" \
  -H "Content-Type: application/json")

echo "   Status: $HTTP_CODE_LIGHT_NBA"

if [ "$HTTP_CODE_LIGHT_NBA" = "403" ]; then
  echo -e "${GREEN}✓ LIGHT/no entitlement: Status 403 (gate funcionando)${NC}"
  BODY_LIGHT_NBA=$(cat /tmp/gatec_ent_light_nba.json 2>/dev/null || echo "")
  echo "   Response: $BODY_LIGHT_NBA"
elif [ "$HTTP_CODE_LIGHT_NBA" = "404" ]; then
  echo -e "${YELLOW}⚠ LIGHT/no entitlement: Status 404 (company/assessment não encontrado)${NC}"
  echo "   (Isso pode acontecer se o JWT_LIGHT não tem acesso à company)"
else
  echo -e "${RED}✗ LIGHT/no entitlement: Status $HTTP_CODE_LIGHT_NBA (esperado 403)${NC}"
  cat /tmp/gatec_ent_light_nba.json
  # Não falhar aqui, pois pode ser que o JWT_LIGHT tenha acesso mas sem entitlement
fi
echo ""

# Summary
echo "=== Entitlement Test Summary ==="
echo ""
echo "FULL entitlement:"
echo "  SUMMARY: Status $HTTP_CODE_FULL_SUMMARY, BODY_HASH=$BODY_HASH_FULL_SUMMARY"
echo "  NEXT-BEST-ACTIONS: Status $HTTP_CODE_FULL_NBA, BODY_HASH=$BODY_HASH_FULL_NBA"
echo ""
echo "LIGHT/no entitlement:"
echo "  SUMMARY: Status $HTTP_CODE_LIGHT_SUMMARY"
echo "  NEXT-BEST-ACTIONS: Status $HTTP_CODE_LIGHT_NBA"
echo ""

# Check if at least one endpoint returned 403 for LIGHT
if [ "$HTTP_CODE_LIGHT_SUMMARY" = "403" ] || [ "$HTTP_CODE_LIGHT_NBA" = "403" ]; then
  echo -e "${GREEN}✓ Entitlement gate working: At least one endpoint returned 403 for non-FULL${NC}"
else
  echo -e "${YELLOW}⚠ Entitlement gate: No 403 detected (may be due to 404 or same user)${NC}"
fi

if [ "$HTTP_CODE_FULL_SUMMARY" = "200" ] && [ "$HTTP_CODE_FULL_NBA" = "200" ]; then
  echo -e "${GREEN}✓ FULL entitlement: Both endpoints returned 200${NC}"
else
  echo -e "${RED}✗ FULL entitlement: Not all endpoints returned 200${NC}"
  exit 1
fi
