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
| `full_gap_instances` | Gaps detectados no submit (assessment_id, gap_id, status CAUSE_PENDING/CAUSE_CLASSIFIED) |
| `full_cause_answers` | Respostas LIKERT por pergunta de causa (assessment_id, gap_id, q_id) |
| `full_gap_causes` | Classificação causa primária/secundária por gap (cause_primary, evidence_json) |

### 015–019 — Evolução

| Migração | Arquivo | Descrição |
|----------|---------|-----------|
| 015 | `full_dod_evidence.sql` | Evidência DoD (critérios de conclusão) por ação |
| 016 | `full_question_bank.sql` | answer_type e dimension em perguntas |
| 017 | `full_findings.sql` | Findings persistidos (3 vazamentos + 3 alavancas por assessment) |
| 018 | `full_catalog_segment_and_microvalue.sql` | segment_applicability (C/I/S), typical_impact_text (faixa) |
| 019 | `full_process_quick_win.sql` | quick_win em full_process_catalog (alavancas preferem) |

### 020–026 — Root Cause e Ciclo

| Migração | Arquivo | Descrição |
|----------|---------|-----------|
| 020 | `full_cycle_history.sql` | Histórico de ciclos fechados |
| 021 | `full_fallback_honest_titles.sql` | Títulos honestos para fallbacks de catálogo |
| 022 | `help_requests.sql` | Tabela de solicitações de ajuda |
| 023 | `full_cause_engine.sql` | Motor de causa (taxonomia, mecanismos, question sets) |
| 024 | `full_root_cause_schema.sql` | full_gap_instances, full_cause_answers, full_gap_causes |
| 025 | `full_gap_instances_status.sql` | status CAUSE_PENDING / CAUSE_CLASSIFIED em full_gap_instances |
| 026 | `full_value_events.sql` | Eventos de valor |

### 027–029 — Relatórios e Versionamento

| Migração | Arquivo | Descrição |
|----------|---------|-----------|
| 027 | `027_full_versioning.sql` | full_version, parent_full_assessment_id, closed_at em full_assessments |
| 028 | `028_full_diagnostic_snapshot.sql` | Snapshot por versão (processes, raios_x, plan, evidence_summary) |
| 029 | `029_full_reports.sql` | Relatórios PDF (status PENDING/READY/FAILED) |

Ver `docs/FULL_REPORTS_SCHEMA.md` para schema e `docs/FULL_REPORTS_API.md` para endpoints REST.

### Constraints principais

- **full_assessments:** 1 DRAFT/SUBMITTED por company (índice parcial único); (company_id, full_version) único
- **full_answers:** UNIQUE (assessment_id, process_key, question_key)
- **full_process_scores:** UNIQUE (assessment_id, process_key)
- **full_findings:** UNIQUE (assessment_id, finding_type, position)
- **full_selected_actions:** UNIQUE (assessment_id, action_key), UNIQUE (assessment_id, position)
- **full_action_evidence:** UNIQUE (assessment_id, action_key) — write-once
- **full_diagnostic_snapshot:** UNIQUE (full_assessment_id)
- **full_reports:** UNIQUE (company_id, full_assessment_id)

### RLS

- Usuário final: acessa apenas assessments da própria company (via companies.owner_user_id)
- Catálogos: SELECT para usuários autenticados

## Catálogo canônico (catalogs/full/)

| Arquivo | Descrição |
|---------|-----------|
| `processes.json` | Processos com microvalor (protects, owner_alert, typical_impact) |
| `questions.json` | Perguntas por processo (12 por processo, 48 total; dimension, segment_applicability) |
| `recommendations.json` | Recomendações por banda (LOW/MEDIUM/HIGH) |
| `actions.json` | Ações por banda (title, benefit_text, metric_hint, dod_checklist) |
| `cause_engine.v1.json` | Motor de causa raiz: gaps, perguntas LIKERT_5, regras SCORE_WEIGHTS |

Seed determinístico: `npm run db:seed:full` (processos, perguntas, recomendações, ações); `010_seed_full_cause_mvp.sql` (causa raiz).

Ver `docs/QUESTIONS_CATALOG.md` para tabelas completas de perguntas.

## Aplicar migração

```bash
npm run db:migrate
```

Se houver erro de SSL (ambiente local), configure `DB_SSL_RELAXED=true` no `.env` (apenas desenvolvimento).
