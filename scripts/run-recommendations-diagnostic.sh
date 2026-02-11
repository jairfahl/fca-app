#!/bin/bash
# Diagnóstico objetivo da API de recomendações
# Uso: ./scripts/run-recommendations-diagnostic.sh [ASSESSMENT_ID]
# Se ASSESSMENT_ID não for passado, tenta descobrir um assessment do usuário de teste

set -e
cd "$(dirname "$0")/.."

# Carrega .env
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# 1) Obter token
TOKEN=$(node tmp_get_token.js 2>/dev/null)
if [ -z "$TOKEN" ]; then
  echo "ERRO: Não foi possível obter token. Verifique TEST_EMAIL/TEST_PASSWORD no .env"
  exit 1
fi

# 2) Se assessment não foi passado, descobrir via DB (assessment COMPLETED com scores)
ASSESSMENT_ID="$1"
if [ -z "$ASSESSMENT_ID" ]; then
  echo "== Descobrindo assessment COMPLETED do usuário..."
  ASSESSMENT_ID=$(node scripts/get-assessment-for-user.js 2>/dev/null | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1) || true
  if [ -z "$ASSESSMENT_ID" ]; then
    echo "ERRO: Nenhum assessment COMPLETED encontrado."
    echo "Faça o fluxo: onboarding -> diagnostico (12 perguntas) -> submit."
    echo "Ou passe um ASSESSMENT_ID manualmente: ./scripts/run-recommendations-diagnostic.sh <UUID>"
    exit 1
  fi
  echo "Assessment usado: $ASSESSMENT_ID"
fi

echo
echo "== HTTP"
curl -sS -i -H "Authorization: Bearer $TOKEN" "http://localhost:3001/assessments/${ASSESSMENT_ID}/recommendations" | head -n 40

echo
echo "== BODY (pretty, primeiras 220 linhas)"
curl -sS -H "Authorization: Bearer $TOKEN" "http://localhost:3001/assessments/${ASSESSMENT_ID}/recommendations" | python3 -m json.tool 2>/dev/null | sed -n '1,220p' || echo "(resposta não é JSON ou erro)"

echo
echo "== QUICK CHECK: fallback / processos / contagem"
curl -sS -H "Authorization: Bearer $TOKEN" "http://localhost:3001/assessments/${ASSESSMENT_ID}/recommendations" | python3 -c '
import json,sys
raw=sys.stdin.read()
try:
    d=json.loads(raw)
except Exception as e:
    print("ERRO ao parsear JSON:", e)
    print("Raw (primeiros 200 chars):", repr(raw[:200]))
    sys.exit(1)

if isinstance(d, dict) and "error" in d:
    print("API retornou erro:", d.get("error"))
    print("(Assessment não pertence ao usuário? Use token de quem criou o assessment.)")
    sys.exit(0)

cands=[]
if isinstance(d, list):
    cands = d
else:
    for k in ["items","recommendations","data"]:
        if isinstance(d.get(k), list):
            cands=d[k]; break
    if not cands and isinstance(d.get("data"), dict):
        for k in ["items","recommendations"]:
            if isinstance(d["data"].get(k), list):
                cands=d["data"][k]; break

def get(x, *keys):
    for k in keys:
        if isinstance(x, dict) and k in x: return x[k]
    return None

by={}
fallback=0
for it in cands:
    p=get(it,"process","processo","area")
    by[p]=by.get(p,0)+1
    code = str(get(it,"recommendation_id","code","slug","id") or "")
    if isinstance(code,str) and "fallback" in code.lower():
        fallback+=1

print("top_level_keys=", sorted(d.keys()) if isinstance(d, dict) else "array")
print("items_len=", len(cands))
print("by_process=", by)
print("fallback_count=", fallback)
print()
print("=== CRITÉRIO OBJETIVO ===")
if len(cands) < 4:
    print("PROBLEMA API/CATÁLOGO: items_len < 4")
elif not all(p in by for p in ["ADM_FIN","GESTAO"]):
    print("PROBLEMA API/CATÁLOGO: by_process não tem ADM_FIN e GESTAO")
elif fallback > 0:
    print("API gerando fallback (catálogo incompleto)")
else:
    print("API OK: 4 processos, sem fallback. Se UI ainda mostra banner, bug é no frontend.")
'
