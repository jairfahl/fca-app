# Módulo FULL — Schema e Migração

## Visão geral

O módulo FULL é um diagnóstico independente do LIGHT, com:
- Área → Processo → Perguntas
- Microvalor por processo (Dinheiro/Cliente/Risco/Gargalo)
- Score por banda (LOW, MEDIUM, HIGH)
- Catálogo fechado (processos, perguntas, recomendações, ações)
- 3 vazamentos + 3 alavancas (findings)
- 3 ações selecionadas + evidência write-once com Antes/Depois

## Migrações

### 014 — Schema base

Arquivo: `db/migrations/014_full_module_schema.sql`

| Tabela | Descrição |
|--------|-----------|
| `full_assessments` | Ciclo FULL (company, segment C/I/S, status DRAFT/SUBMITTED/CLOSED) |
| `full_process_catalog` | Catálogo de processos (area_key, process_key, protects_dimension) |
| `full_question_catalog` | Perguntas por processo (question_key, dimension EXISTENCIA/ROTINA/DONO/CONTROLE) |
| `full_recommendation_catalog` | Recomendações por processo e banda |
| `full_action_catalog` | Ações por processo e banda (dod_checklist jsonb) |
| `full_answers` | Respostas (assessment_id, process_key, question_key, answer_value 0-10) |
| `full_process_scores` | Scores por processo (score_numeric, band, support jsonb) |
| `full_generated_recommendations` | Recomendações geradas (determinístico) |
| `full_selected_actions` | 3 ações selecionadas (position 1-3, status NOT_STARTED/IN_PROGRESS/DONE/DROPPED) |
| `full_action_evidence` | Evidência write-once (evidence_text, before_baseline, after_result) |
| `full_consultant_notes` | Notas do consultor (ORIENTACAO, IMPEDIMENTO, PROXIMO_PASSO) |

### 015–019 — Evolução

| Migração | Arquivo | Descrição |
|----------|---------|-----------|
| 015 | `full_dod_evidence.sql` | Evidência DoD (critérios de conclusão) por ação |
| 016 | `full_question_bank.sql` | answer_type e dimension em perguntas |
| 017 | `full_findings.sql` | Findings persistidos (3 vazamentos + 3 alavancas por assessment) |
| 018 | `full_catalog_segment_and_microvalue.sql` | segment_applicability (C/I/S), typical_impact_text (faixa) |
| 019 | `full_process_quick_win.sql` | quick_win em full_process_catalog (alavancas preferem) |

### Constraints principais

- **full_assessments:** 1 DRAFT/SUBMITTED por company (índice parcial único)
- **full_answers:** UNIQUE (assessment_id, process_key, question_key)
- **full_process_scores:** UNIQUE (assessment_id, process_key)
- **full_findings:** UNIQUE (assessment_id, finding_type, position)
- **full_selected_actions:** UNIQUE (assessment_id, action_key), UNIQUE (assessment_id, position)
- **full_action_evidence:** UNIQUE (assessment_id, action_key) — write-once

### RLS

- Usuário final: acessa apenas assessments da própria company (via companies.owner_user_id)
- Catálogos: SELECT para usuários autenticados

## Catálogo canônico (catalogs/full/)

| Arquivo | Descrição |
|---------|-----------|
| `processes.json` | Processos com microvalor (protects, owner_alert, typical_impact) |
| `questions.json` | Perguntas por processo (dimension, segment_applicability) |
| `recommendations.json` | Recomendações por banda (LOW/MEDIUM/HIGH) |
| `actions.json` | Ações por banda (title, benefit_text, metric_hint, dod_checklist) |

Seed determinístico: `npm run db:seed:full`

## Aplicar migração

```bash
npm run db:migrate
```

Se houver erro de SSL (ambiente local), configure `DB_SSL_RELAXED=true` no `.env` (apenas desenvolvimento).
