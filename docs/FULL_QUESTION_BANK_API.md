# FULL Question Bank — Contrato de API

## Visão Geral

Catálogo fechado de processos e perguntas FULL. Endpoints determinísticos para listar catálogo, salvar respostas (DRAFT) e submeter (SUBMITTED). Resultados "Raio-X do dono" (3 vazamentos + 3 alavancas) e plano mínimo (3 ações).

## Modelo de Dados

- **full_process_catalog**: processos (COMERCIAL, OPERACOES, ADM_FIN, GESTAO)
  - `protects_dimension` ∈ {DINHEIRO, CLIENTE, RISCO, GARGALO}
  - `protects_text`, `owner_alert_text`, `typical_impact_band`, `typical_impact_text` (faixa)
  - `segment_applicability` (array, ex: ['C','I','S']), `quick_win` (boolean)

- **full_question_catalog**: perguntas por processo (12 por processo)
  - `answer_type` ∈ {SCALE_0_10, YES_NO, MULTI}
  - `dimension` ∈ {EXISTENCIA, ROTINA, DONO, CONTROLE}
  - `segment_applicability` (array, ex: ['C','I','S'])

- **full_answers**: respostas do assessment
  - `assessment_id`, `process_key`, `question_key`, `answer_value` (0–10), `answered_at`

- **full_findings**: 3 vazamentos + 3 alavancas (payload: o_que_esta_acontecendo, custo_de_nao_agir, o_que_muda_em_30_dias, primeiro_passo. trace: question_refs, como_puxou_nivel)

## Endpoints

### GET /full/catalog?segment=C|I|S

Retorna processos e perguntas agrupadas por segmento.

**Query:**
- `segment` (opcional): C, I ou S. Default: C.
- `company_id` (opcional): resolve segment via company.

**Resposta:**
```json
{
  "segment": "C",
  "areas": [{ "area": "COMERCIAL", "processes": [...] }],
  "processes": [
    {
      "process_key": "COMERCIAL",
      "protects_dimension": "CLIENTE",
      "protects_text": "...",
      "owner_alert_text": "...",
      "typical_impact_band": "HIGH",
      "typical_impact_text": "5-20 horas/mês perdidas em retrabalho comercial",
      "quick_win": true,
      "o_que_protege": "CLIENTE",
      "sinal_alerta": "...",
      "impacto_tipico": "...",
      "questions": [
        { "question_key": "Q01", "question_text": "...", "dimension": "EXISTENCIA", "answer_type": "SCALE_0_10", ... }
      ]
    }
  ]
}
```

**Audit:** `[AUDIT] full_catalog_loaded segment=... processes=... questions=...`

---

### PUT/POST /full/assessments/:id/answers?company_id=

Salva respostas (upsert idempotente). Apenas para assessment em DRAFT.

**Body (formato A):**
```json
{
  "process_key": "COMERCIAL",
  "answers": [
    { "question_key": "Q01", "answer_value": 5 },
    { "question_key": "Q02", "answer_value": 7 }
  ]
}
```

**Body (formato B):**
```json
{
  "answers": [
    { "question_id": "COMERCIAL:Q01", "answer_value": 5 },
    { "question_id": "COMERCIAL:Q02", "answer_value": 7 }
  ]
}
```

**Resposta:** `{ "ok": true, "count": 2 }`

**Audit:** `[AUDIT] full_answer_saved assessment_id=... count=...`

---

### POST /full/assessments/:id/submit?company_id=

Valida completude (todas perguntas obrigatórias respondidas), calcula scores e muda status para SUBMITTED.

**Sucesso:** `{ "ok": true, "status": "SUBMITTED", "scores": [...] }`

**Erro (incompleto):**
```json
{
  "error": "diagnóstico incompleto: faltam respostas obrigatórias",
  "missing_questions": ["COMERCIAL:Q03", "OPERACOES:Q01"]
}
```

**Audit:** `[AUDIT] full_submit assessment_id=... status=SUBMITTED` ou `full_submit FAIL incompleto`

---

### GET /full/results?assessment_id=&company_id=

Retorna resultados FULL (findings + six_pack).

**Resposta:**
```json
{
  "findings": [...],
  "six_pack": {
    "vazamentos": [
      {
        "title": "Comercial (LOW)",
        "o_que_acontece": "...",
        "custo_nao_agir": "...",
        "muda_em_30_dias": "...",
        "primeiro_passo": "Criar rotina de prospecção (LOW)",
        "primeiro_passo_action_id": "act-com-1-low",
        "is_fallback": false,
        "supporting": { "como_puxou_nivel": "...", "questions": [...] }
      }
    ],
    "alavancas": [...]
  }
}
```

---

### GET /full/plan/status?assessment_id=&company_id=

Retorna status do plano mínimo (3 ações).

**Resposta:**
```json
{
  "exists": true,
  "progress": "1/3",
  "next_action_title": "Criar rotina de prospecção (LOW)"
}
```

---

### GET /full/actions?assessment_id=&company_id=

Retorna sugestões de ações para o plano (baseadas nos findings).

**Resposta:**
```json
{
  "suggestions": [
    { "process_key": "COMERCIAL", "band": "LOW", "action_key": "act-com-1-low", "title": "...", "benefit_text": "...", "metric_hint": "..." }
  ]
}
```

---

## Seed

```bash
npm run db:seed:full
```

Carrega catálogo de `catalogs/full/*.json`. Garante 4 processos + 12 perguntas por processo + recomendações + ações. Idempotente.
