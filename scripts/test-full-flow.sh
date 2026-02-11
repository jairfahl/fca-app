#!/bin/bash
# Script para demonstrar fluxo completo FULL: start → answers → submit → results → recommendations → plan
# Requer: API rodando, JWT válido, company_id com entitlement FULL
set -e

API="${API_URL:-http://localhost:3001}"
TOKEN="${JWT:-$(node tmp_get_token.js 2>/dev/null || true)}"
COMPANY_ID="${COMPANY_ID:-}"

if [ -z "$TOKEN" ]; then
  echo "ERRO: JWT não configurado. Use: export JWT=\$(node tmp_get_token.js)"
  exit 1
fi

if [ -z "$COMPANY_ID" ]; then
  echo "Buscando company_id..."
  COMPANIES=$(curl -s "$API/companies" -H "Authorization: Bearer $TOKEN")
  COMPANY_ID=$(echo "$COMPANIES" | jq -r '.[0].id // empty')
  if [ -z "$COMPANY_ID" ]; then
    echo "ERRO: Nenhuma company encontrada. Crie uma em POST /companies antes."
    exit 1
  fi
  echo "Usando company_id=$COMPANY_ID"
fi

# Garantir entitlement FULL em dev (manual-unlock)
if [ "$NODE_ENV" != "production" ]; then
  curl -s -X POST "$API/entitlements/manual-unlock" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"company_id\":\"$COMPANY_ID\"}" | jq -c . 2>/dev/null || true
fi

echo "=== 1) POST /full/assessments/start (force_new=1 para fluxo fresco) ==="
START=$(curl -s -X POST "$API/full/assessments/start" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"company_id\":\"$COMPANY_ID\",\"segment\":\"C\",\"force_new\":true}")
echo "$START" | jq .
ASSESSMENT_ID=$(echo "$START" | jq -r '.assessment_id')
if [ -z "$ASSESSMENT_ID" ] || [ "$ASSESSMENT_ID" = "null" ]; then
  echo "Erro ao obter assessment_id"
  exit 1
fi
echo "assessment_id=$ASSESSMENT_ID"

echo ""
echo "=== 2) GET /full/assessments/:id ==="
curl -s "$API/full/assessments/$ASSESSMENT_ID?company_id=$COMPANY_ID" \
  -H "Authorization: Bearer $TOKEN" | jq .

echo ""
echo "=== 3) GET /full/catalog?segment=C ==="
curl -s "$API/full/catalog?segment=C" \
  -H "Authorization: Bearer $TOKEN" | jq '.processes | length' 
echo "processos no catálogo"

echo ""
echo "=== 4) PUT /full/assessments/:id/answers (COMERCIAL) ==="
# 12 perguntas Q01-Q12 com valores 0-10
ANSWERS='[{"question_key":"Q01","answer_value":3},{"question_key":"Q02","answer_value":4},{"question_key":"Q03","answer_value":5},{"question_key":"Q04","answer_value":2},{"question_key":"Q05","answer_value":6},{"question_key":"Q06","answer_value":3},{"question_key":"Q07","answer_value":4},{"question_key":"Q08","answer_value":5},{"question_key":"Q09","answer_value":2},{"question_key":"Q10","answer_value":4},{"question_key":"Q11","answer_value":3},{"question_key":"Q12","answer_value":5}]'
curl -s -X PUT "$API/full/assessments/$ASSESSMENT_ID/answers?company_id=$COMPANY_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"process_key\":\"COMERCIAL\",\"answers\":$ANSWERS}" | jq .

echo ""
echo "=== 4b) PUT answers (OPERACOES, ADM_FIN, GESTAO) ==="
for PROC in OPERACOES ADM_FIN GESTAO; do
  A="[{\"question_key\":\"Q01\",\"answer_value\":4},{\"question_key\":\"Q02\",\"answer_value\":5},{\"question_key\":\"Q03\",\"answer_value\":6},{\"question_key\":\"Q04\",\"answer_value\":4},{\"question_key\":\"Q05\",\"answer_value\":5},{\"question_key\":\"Q06\",\"answer_value\":4},{\"question_key\":\"Q07\",\"answer_value\":5},{\"question_key\":\"Q08\",\"answer_value\":6},{\"question_key\":\"Q09\",\"answer_value\":4},{\"question_key\":\"Q10\",\"answer_value\":5},{\"question_key\":\"Q11\",\"answer_value\":4},{\"question_key\":\"Q12\",\"answer_value\":5}]"
  curl -s -X PUT "$API/full/assessments/$ASSESSMENT_ID/answers?company_id=$COMPANY_ID" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"process_key\":\"$PROC\",\"answers\":$A}" | jq -c .
done

echo ""
echo "=== 5) GET /full/assessments/:id/answers ==="
curl -s "$API/full/assessments/$ASSESSMENT_ID/answers?company_id=$COMPANY_ID" \
  -H "Authorization: Bearer $TOKEN" | jq '.answers | length'
echo "respostas salvas"

echo ""
echo "=== 6) POST /full/assessments/:id/submit ==="
curl -s -X POST "$API/full/assessments/$ASSESSMENT_ID/submit?company_id=$COMPANY_ID" \
  -H "Authorization: Bearer $TOKEN" | jq .

echo ""
echo "=== 7) GET /full/assessments/:id/results (3 vazamentos + 3 alavancas) ==="
curl -s "$API/full/assessments/$ASSESSMENT_ID/results?company_id=$COMPANY_ID" \
  -H "Authorization: Bearer $TOKEN" | jq '.items | length'
echo "itens (deve ser 6)"
curl -s "$API/full/assessments/$ASSESSMENT_ID/results?company_id=$COMPANY_ID" \
  -H "Authorization: Bearer $TOKEN" | jq '.items[] | {type, title, first_step_action_key}'

echo ""
echo "=== 8) GET /full/assessments/:id/recommendations ==="
RECS=$(curl -s "$API/full/assessments/$ASSESSMENT_ID/recommendations?company_id=$COMPANY_ID" \
  -H "Authorization: Bearer $TOKEN")
echo "$RECS" | jq '.recommendations | length'
echo "recomendações por processo"
echo "$RECS" | jq '.recommendations[0] | {process_key, band, recommendation: .recommendation.title, actions_count: (.actions | length)}'

echo ""
echo "=== 9) POST /full/assessments/:id/plan/select (3 ações) ==="
# Pegar 3 action_keys das recomendações
ACT1=$(echo "$RECS" | jq -r '.recommendations[0].actions[0].action_key')
ACT2=$(echo "$RECS" | jq -r '.recommendations[1].actions[0].action_key')
ACT3=$(echo "$RECS" | jq -r '.recommendations[2].actions[0].action_key')
PLAN_BODY="{\"items\":[{\"position\":1,\"action_key\":\"$ACT1\",\"owner_name\":\"Dono 1\",\"metric_text\":\"Métrica 1\",\"checkpoint_date\":\"2025-03-15\"},{\"position\":2,\"action_key\":\"$ACT2\",\"owner_name\":\"Dono 2\",\"metric_text\":\"Métrica 2\",\"checkpoint_date\":\"2025-03-20\"},{\"position\":3,\"action_key\":\"$ACT3\",\"owner_name\":\"Dono 3\",\"metric_text\":\"Métrica 3\",\"checkpoint_date\":\"2025-03-25\"}]}"
curl -s -X POST "$API/full/assessments/$ASSESSMENT_ID/plan/select?company_id=$COMPANY_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PLAN_BODY" | jq .

echo ""
echo "=== 10) GET /full/assessments/:id/plan ==="
curl -s "$API/full/assessments/$ASSESSMENT_ID/plan?company_id=$COMPANY_ID" \
  -H "Authorization: Bearer $TOKEN" | jq .

echo ""
echo "=== 11) DoD + Evidência: tentar DONE sem DoD/evidência -> 400 ==="
RES=$(curl -s -X PATCH "$API/full/assessments/$ASSESSMENT_ID/plan/$ACT1/status?company_id=$COMPANY_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"DONE"}')
echo "$RES" | jq .
if echo "$RES" | jq -e '.error' >/dev/null 2>&1; then
  echo "OK: DONE rejeitado sem DoD/evidência"
else
  echo "AVISO: esperado 400 com error"
fi

echo ""
echo "=== 12) GET /full/actions/:action_key/dod ==="
curl -s "$API/full/actions/$ACT1/dod" \
  -H "Authorization: Bearer $TOKEN" | jq .

echo ""
echo "=== 13) POST dod/confirm ==="
DOD_ITEMS=$(curl -s "$API/full/actions/$ACT1/dod" -H "Authorization: Bearer $TOKEN" | jq -c '.dod_checklist')
curl -s -X POST "$API/full/assessments/$ASSESSMENT_ID/plan/$ACT1/dod/confirm?company_id=$COMPANY_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"confirmed_items\":$DOD_ITEMS}" | jq .

echo ""
echo "=== 14) POST evidence (write-once) ==="
curl -s -X POST "$API/full/assessments/$ASSESSMENT_ID/plan/$ACT1/evidence?company_id=$COMPANY_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"evidence_text":"Ação executada conforme DoD","before_baseline":"Baseline inicial","after_result":"Resultado atingido"}' | jq .

echo ""
echo "=== 15) PATCH status DONE ==="
curl -s -X PATCH "$API/full/assessments/$ASSESSMENT_ID/plan/$ACT1/status?company_id=$COMPANY_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"DONE"}' | jq .

echo ""
echo "=== 16) Re-enviar evidência -> already_exists ==="
curl -s -X POST "$API/full/assessments/$ASSESSMENT_ID/plan/$ACT1/evidence?company_id=$COMPANY_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"evidence_text":"outra","before_baseline":"x","after_result":"y"}' | jq '.already_exists, .evidence.declared_gain'

echo ""
echo "=== FLUXO COMPLETO OK (incl. DoD + evidência) ==="
