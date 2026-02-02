#!/bin/bash
# Test script for Gate C determinism (summary + next-best-actions)
# Tests that 2 consecutive calls return identical normalized bodies

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check arguments
if [ $# -lt 3 ]; then
  echo "Usage: $0 <company_id> <assessment_id> <jwt>"
  echo ""
  echo "Example:"
  echo "  export JWT=\$(node ../tmp_get_token.js)"
  echo "  $0 136ced85-0c92-4127-b42e-568a18864b01 <assessment_id> \$JWT"
  exit 1
fi

COMPANY_ID="$1"
ASSESSMENT_ID="$2"
JWT="$3"

API_URL="http://localhost:3001"

echo "=== GATE C: Test Determinism ==="
echo ""
echo "Company ID: $COMPANY_ID"
echo "Assessment ID: $ASSESSMENT_ID"
echo "API URL: $API_URL"
echo ""

# Test 1: GET /full/assessments/:id/summary (call 1)
echo "1. GET /full/assessments/:id/summary (call 1)..."
HTTP_CODE_1=$(curl -s -w "%{http_code}" -o /tmp/gatec_summary_1.json \
  "${API_URL}/full/assessments/${ASSESSMENT_ID}/summary?company_id=${COMPANY_ID}" \
  -H "Authorization: Bearer ${JWT}" \
  -H "Content-Type: application/json")

if [ "$HTTP_CODE_1" != "200" ]; then
  echo -e "${RED}✗ Status $HTTP_CODE_1 (esperado 200)${NC}"
  cat /tmp/gatec_summary_1.json
  exit 1
fi

echo -e "${GREEN}✓ Status $HTTP_CODE_1${NC}"

# Normalize body 1 (remove generated_at)
BODY_NORM_1=$(cat /tmp/gatec_summary_1.json | jq -c 'del(.generated_at)' 2>/dev/null || echo "")
BODY_HASH_1=$(echo -n "$BODY_NORM_1" | shasum -a 256 | cut -d' ' -f1)
echo "   BODY_HASH_1: $BODY_HASH_1"
echo ""

# Test 2: GET /full/assessments/:id/summary (call 2)
echo "2. GET /full/assessments/:id/summary (call 2)..."
HTTP_CODE_2=$(curl -s -w "%{http_code}" -o /tmp/gatec_summary_2.json \
  "${API_URL}/full/assessments/${ASSESSMENT_ID}/summary?company_id=${COMPANY_ID}" \
  -H "Authorization: Bearer ${JWT}" \
  -H "Content-Type: application/json")

if [ "$HTTP_CODE_2" != "200" ]; then
  echo -e "${RED}✗ Status $HTTP_CODE_2 (esperado 200)${NC}"
  cat /tmp/gatec_summary_2.json
  exit 1
fi

echo -e "${GREEN}✓ Status $HTTP_CODE_2${NC}"

# Normalize body 2 (remove generated_at)
BODY_NORM_2=$(cat /tmp/gatec_summary_2.json | jq -c 'del(.generated_at)' 2>/dev/null || echo "")
BODY_HASH_2=$(echo -n "$BODY_NORM_2" | shasum -a 256 | cut -d' ' -f1)
echo "   BODY_HASH_2: $BODY_HASH_2"
echo ""

# Compare hashes for summary
if [ "$BODY_HASH_1" = "$BODY_HASH_2" ]; then
  echo -e "${GREEN}✓ SUMMARY: Determinism PASS (hashes iguais)${NC}"
else
  echo -e "${RED}✗ SUMMARY: Determinism FAIL (hashes diferentes)${NC}"
  echo "   Diff:"
  diff -u <(echo "$BODY_NORM_1" | jq .) <(echo "$BODY_NORM_2" | jq .) || true
  exit 1
fi
echo ""

# Test 3: GET /full/assessments/:id/next-best-actions (call 1)
echo "3. GET /full/assessments/:id/next-best-actions (call 1)..."
HTTP_CODE_3=$(curl -s -w "%{http_code}" -o /tmp/gatec_nba_1.json \
  "${API_URL}/full/assessments/${ASSESSMENT_ID}/next-best-actions?company_id=${COMPANY_ID}" \
  -H "Authorization: Bearer ${JWT}" \
  -H "Content-Type: application/json")

if [ "$HTTP_CODE_3" != "200" ]; then
  echo -e "${RED}✗ Status $HTTP_CODE_3 (esperado 200)${NC}"
  cat /tmp/gatec_nba_1.json
  exit 1
fi

echo -e "${GREEN}✓ Status $HTTP_CODE_3${NC}"

# Normalize body 1 (remove generated_at)
BODY_NORM_NBA_1=$(cat /tmp/gatec_nba_1.json | jq -c 'del(.generated_at)' 2>/dev/null || echo "")
BODY_HASH_NBA_1=$(echo -n "$BODY_NORM_NBA_1" | shasum -a 256 | cut -d' ' -f1)
echo "   BODY_HASH_NBA_1: $BODY_HASH_NBA_1"
echo ""

# Test 4: GET /full/assessments/:id/next-best-actions (call 2)
echo "4. GET /full/assessments/:id/next-best-actions (call 2)..."
HTTP_CODE_4=$(curl -s -w "%{http_code}" -o /tmp/gatec_nba_2.json \
  "${API_URL}/full/assessments/${ASSESSMENT_ID}/next-best-actions?company_id=${COMPANY_ID}" \
  -H "Authorization: Bearer ${JWT}" \
  -H "Content-Type: application/json")

if [ "$HTTP_CODE_4" != "200" ]; then
  echo -e "${RED}✗ Status $HTTP_CODE_4 (esperado 200)${NC}"
  cat /tmp/gatec_nba_2.json
  exit 1
fi

echo -e "${GREEN}✓ Status $HTTP_CODE_4${NC}"

# Normalize body 2 (remove generated_at)
BODY_NORM_NBA_2=$(cat /tmp/gatec_nba_2.json | jq -c 'del(.generated_at)' 2>/dev/null || echo "")
BODY_HASH_NBA_2=$(echo -n "$BODY_NORM_NBA_2" | shasum -a 256 | cut -d' ' -f1)
echo "   BODY_HASH_NBA_2: $BODY_HASH_NBA_2"
echo ""

# Compare hashes for next-best-actions
if [ "$BODY_HASH_NBA_1" = "$BODY_HASH_NBA_2" ]; then
  echo -e "${GREEN}✓ NEXT-BEST-ACTIONS: Determinism PASS (hashes iguais)${NC}"
else
  echo -e "${RED}✗ NEXT-BEST-ACTIONS: Determinism FAIL (hashes diferentes)${NC}"
  echo "   Diff:"
  diff -u <(echo "$BODY_NORM_NBA_1" | jq .) <(echo "$BODY_NORM_NBA_2" | jq .) || true
  exit 1
fi
echo ""

echo -e "${GREEN}=== Determinism Test PASSED ===${NC}"
echo ""
echo "Summary:"
echo "  SUMMARY endpoint: BODY_HASH_1=$BODY_HASH_1, BODY_HASH_2=$BODY_HASH_2"
echo "  NEXT-BEST-ACTIONS endpoint: BODY_HASH_NBA_1=$BODY_HASH_NBA_1, BODY_HASH_NBA_2=$BODY_HASH_NBA_2"
