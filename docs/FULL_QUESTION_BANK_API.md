# FULL Question Bank — Contrato de API

## Visão Geral

Catálogo fechado de processos e perguntas FULL. Endpoints determinísticos para listar catálogo, salvar respostas (DRAFT) e submeter (SUBMITTED). Resultados "Raio-X do dono" (3 vazamentos + 3 alavancas) e plano mínimo (3 ações).

**Referência de perguntas:** Ver `docs/QUESTIONS_CATALOG.md` para tabelas completas (LIGHT 12, FULL 48, causa raiz 12).

## Regras de coerência (Prompt 7)

- **Recomendações:** Somente quando há match de catálogo (processo + banda + segmento) e sustentação por respostas (evidence_keys).
- **Fallback:** Não exibir como recomendação "padrão". Registrar como gap de conteúdo; no máximo exibir "Conteúdo em definição pelo método" (modo consultor).
- **is_gap_content:** Quando `true`, USER não vê o card; CONSULTOR vê com badge "Conteúdo em definição".
- **evidence_keys:** Array de refs (ex: `["COMERCIAL_Q01", "OPERACOES_Q03"]`) que sustentam cada recomendação.

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

Valida completude (todas perguntas obrigatórias respondidas), valida catálogo, calcula scores e muda status para SUBMITTED. Gera findings (3 vazamentos + 3 alavancas) com fallback determinístico quando catálogo incompleto.

**Sucesso:** `{ "ok": true, "status": "SUBMITTED", "scores": [...], "findings_count": 6 }`

**Erro 400 DIAG_INCOMPLETE (incompleto):**
```json
{
  "code": "DIAG_INCOMPLETE",
  "message_user": "Faltam respostas. Complete o processo X.",
  "missing": [{ "process_key": "OPERACOES", "missing_question_keys": ["Q01", "Q02"] }],
  "missing_process_keys": ["OPERACOES"],
  "answered_count": 36,
  "total_expected": 48
}
```

**Erro 500 CATALOG_INVALID:** Catálogo inconsistente (ex.: processo sem perguntas no catálogo).

**Erro 500 FINDINGS_FAILED:** Falha ao gerar findings. Payload inclui `debug_id` para suporte.

**Audit:** `[AUDIT] full_submit_incomplete { assessment_id, missing_process_keys, answered_count }` ou `[AUDIT] full_catalog_missing { company_id, assessment_id, process_key }`

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
        "is_gap_content": false,
        "evidence_keys": ["COMERCIAL_Q01", "COMERCIAL_Q03"],
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

Retorna sugestões de ações para o plano (baseadas nos findings e no motor de causa). **Somente recomendações com encaixe real** (match de catálogo + evidência nas respostas). Itens fallback/genéricos não são retornados.

**Resposta:**
```json
{
  "ok": true,
  "suggestions": [
    { "process_key": "COMERCIAL", "band": "LOW", "action_key": "act-com-1-low", "title": "...", "benefit_text": "...", "metric_hint": "...", "why": [...], "evidence_keys": ["COMERCIAL_Q01", "COMERCIAL_Q03"], "is_gap_content": false }
  ],
  "assessment_id": "...",
  "required_count": 3,
  "remaining_count": 8,
  "has_cause_coverage": true,
  "mechanism_required_action_keys": ["ADM_FIN-ROTINA_CAIXA_SEMANAL", "ADM_FIN-DONO_CAIXA"]
}
```

Quando há causas classificadas (`full_gap_causes`), `mechanism_required_action_keys` lista as ações obrigatórias do mecanismo. O frontend deve incluir pelo menos uma no plano.

---

### POST /full/plan?company_id=

Cria/atualiza plano mínimo (3 ações). **Validação de mecanismo:** quando há causas classificadas (`full_gap_causes`), exige pelo menos 1 ação de `mechanism_required_action_keys`.

**Body (sucesso):**
```json
{
  "assessment_id": "...",
  "company_id": "...",
  "actions": [
    { "action_key": "...", "owner_name": "...", "metric_text": "...", "checkpoint_date": "YYYY-MM-DD", "position": 1 }
  ]
}
```

**Erro 400 MECHANISM_ACTION_REQUIRED:**
```json
{
  "code": "MECHANISM_ACTION_REQUIRED",
  "message_user": "Sem atacar a causa, você volta ao mesmo problema. Inclua pelo menos uma ação do mecanismo indicado.",
  "mechanism_action_keys": ["ADM_FIN-ROTINA_CAIXA_SEMANAL", "ADM_FIN-DONO_CAIXA"]
}
```

---

## Seed

```bash
npm run db:seed:full
```

Carrega catálogo de `catalogs/full/*.json`. Garante 4 processos + 12 perguntas por processo + recomendações + ações. Idempotente.
