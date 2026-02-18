# FULL Root Cause Engine — Modelo de Dados

**Objetivo:** Schema DB-first para classificação determinística de causa, versionamento e rastreabilidade.

---

## 1. Diagrama ER (simplificado)

```
┌─────────────────────┐     ┌──────────────────────────┐
│ full_cause_taxonomy │────<│ full_cause_mechanisms     │
│ (id PK)             │     │ (cause_id FK)            │
└─────────────────────┘     └──────────────────────────┘
         │                              │
         │                              │
         v                              v
┌─────────────────────┐     ┌──────────────────────────────────┐
│ full_recommendation │     │ full_cause_mechanism_actions      │
│ _catalog            │     │ (gap_id, cause_id, action_key)   │
│ (+ cause_id FK)     │     └──────────────────────────────────┘
└─────────────────────┘
         │
         v
┌─────────────────────────────────────┐
│ full_cause_question_sets            │
│ (gap_id, process_key, version)      │
└─────────────────────────────────────┘
         │
         ├──────────────────────────────┐
         v                              v
┌─────────────────────┐     ┌─────────────────────┐
│ full_cause_questions│     │ full_cause_rules     │
│ (q_id, texto_cliente)│     │ (config_json weights)│
└─────────────────────┘     └─────────────────────┘
         │
         v
┌─────────────────────────────┐
│ full_cause_answer_options   │
│ (question_type, option_value)│
└─────────────────────────────┘

┌─────────────────────┐     ┌─────────────────────┐
│ full_assessments    │────<│ full_gap_instances   │
│ full_process_scores │     │ (assessment_id, gap) │
└─────────────────────┘     └─────────────────────┘
         │
         v
┌─────────────────────┐     ┌─────────────────────┐
│ full_cause_answers  │     │ full_gap_causes      │
│ (assessment, gap, q) │     │ (cause_primary, ev)  │
└─────────────────────┘     └─────────────────────┘
```

---

## 2. Tabelas

### Catálogo (sem tenancy)

| Tabela | Papel |
|--------|-------|
| **full_cause_taxonomy** | Taxonomia fechada de causas (id, label_cliente, mecanismo_primario, version) |
| **full_cause_mechanisms** | Mecanismos por causa (cause_id FK, mechanism_key, label_cliente, version) |
| **full_cause_answer_options** | Opções objetivas (LIKERT_5: DISCORDO_PLENAMENTE, etc.) |
| **full_cause_question_sets** | Conjuntos de perguntas por gap (gap_id, process_key, version) |
| **full_cause_questions** | Perguntas (question_set_id FK, q_id, texto_cliente, question_type) |
| **full_cause_rules** | Regras versionadas (weights, tie_breaker em config_json) |
| **full_cause_mechanism_actions** | Mapeamento gap→causa→action_key |

### Instâncias (com tenancy)

| Tabela | Papel |
|--------|-------|
| **full_gap_instances** | Gaps detectados no submit (assessment_id, company_id, gap_id, source, status: CAUSE_PENDING | CAUSE_CLASSIFIED) |
| **full_cause_answers** | Respostas LIKERT por pergunta (023) |
| **full_gap_causes** | Classificação causa primária/secundária + evidências (023) |

### Adaptações

| Tabela | Alteração |
|--------|-----------|
| **full_action_catalog** | + cause_mechanism_id (opcional) |
| **full_recommendation_catalog** | + cause_id (opcional) |

---

## 3. Versionamento

- **full_cause_taxonomy**: `version` em cada linha
- **full_cause_question_sets**: `UNIQUE (gap_id, version)`
- **full_cause_rules**: `UNIQUE (question_set_id, version)`
- **full_cause_mechanisms**, **full_cause_answer_options**: `version` por linha

---

## 4. Rastreabilidade

- **full_gap_causes.evidence_json**: array de `{ q_id, answer, texto_cliente }` — quais respostas sustentam a causa
- **full_cause_answers**: respostas brutas por assessment/gap/q_id
- **full_gap_instances**: quando e de onde o gap foi detectado (source: 'submit')

---

## 5. RLS e tenancy

- **Catálogos** (taxonomy, mechanisms, questions, rules, options): `SELECT` para `auth.uid() IS NOT NULL`
- **full_gap_instances**: `ALL` via `company_id IN (companies WHERE owner_user_id = auth.uid())`
- **full_cause_answers**, **full_gap_causes**: mantêm RLS existente (023)

---

## 6. Migrations e seeds

| Arquivo | Conteúdo |
|---------|----------|
| `db/migrations/024_full_root_cause_schema.sql` | Criação das tabelas + colunas opcionais |
| `db/migrations/025_full_gap_instances_status.sql` | status CAUSE_PENDING / CAUSE_CLASSIFIED em full_gap_instances |
| `db/rollbacks/024_full_root_cause_schema_rollback.sql` | Rollback viável (exec manual) |
| `db/seed/009_seed_full_cause_taxonomy.sql` | Taxonomia + mecanismos + opções LIKERT_5 |
| `db/seed/seed-cause-taxonomy.js` | Executa o seed 009 (via `npm run db:seed`) |

---

## 7. Notas

- O Motor de Causa atual (`causeEngine.js`) continua lendo de `catalogs/full/cause_engine.v1.json`. As novas tabelas permitem migração futura para DB.
- `full_gap_causes` (023) permanece como tabela de classificação; `full_gap_instances` registra a detecção do gap.
- Sem campo aberto de causa no MVP: todas as opções vêm de `full_cause_answer_options`.
