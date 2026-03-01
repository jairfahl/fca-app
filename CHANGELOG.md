# Changelog

Alterações notáveis do projeto FCA-MTR.

---

## [Unreleased]

### Documentação (2025-02-19)

- **Rotas consultor padronizadas:** CONSULTOR_NAV_AUDIT.md atualizado com rotas atuais (overview, redirects, RoleGate).
- **ARCHITECTURE.md, README.md, roles.md:** Rotas CONSULTOR atualizadas (home `/consultor`, overview `/consultor/company/[id]/overview`).
- **QUESTIONS_CATALOG.md:** Novo documento com tabelas de perguntas LIGHT (12), FULL (48 por processo), causa raiz (12).
- **catalogs/full/README.md:** Referência a `cause_engine.v1.json` no catálogo.
- **QA_CONSULTOR_SMOKE.md:** URL da overview atualizada para `/consultor/company/:id/overview`.

### Fase 7 — Relatórios e Versionamento

- **Relatórios PDF:** Geração e download de relatórios (gerar → status → download). Endpoint retorna 200 e `Content-Type: application/pdf`.
- **Histórico de versões:** Versões ordenadas por `full_version` desc; incremento correto entre v1, v2, etc.
- **Comparação entre versões:** `GET /full/compare?from=1&to=2` retorna JSON com `from_version`, `to_version`, `evolution_by_process`.
- **Papéis USER / CONSULTOR / ADMIN:** Guards de role; USER recebe 403 em rotas de consultor (`/consultor/companies`).
- **Testes E2E:** Script `scripts/e2e-reports-versions-roles.js` cobre relatórios, versões, comparação e roles. Documentação em `scripts/test-full-reports-versions-roles.md`. Comando: `npm run e2e:reports`.

### Backend (API)

- **Submit FULL:** Validação de pré-condições antes de gerar findings. Retorna 400 `DIAG_INCOMPLETE` com `missing_process_keys`, `answered_count`, `total_expected` quando faltam respostas. Retorna 500 `CATALOG_INVALID` se catálogo inconsistente.
- **Catálogo incompleto:** Findings não quebram por falta de catálogo. `getProcessMeta(processKey)` usa fallback e loga `[AUDIT] full_catalog_missing`.
- **Vazamentos/alavancas:** Retorna 0–3 itens conforme disponível (removidos `while` que completavam artificialmente).
- **MECHANISM_ACTION_REQUIRED:** `POST /full/plan` e `POST /full/cycle/select-actions` validam que o plano inclua pelo menos 1 ação do mecanismo quando há causas classificadas. Retornam 400 com `mechanism_action_keys`.
- **GET /full/actions:** Retorna `mechanism_required_action_keys` quando há causas classificadas.
- **full_gap_instances:** Update de status (CAUSE_PENDING → CAUSE_CLASSIFIED) sem `updated_at`; checagem de erro no update.

### Frontend (Web)

- **Wizard:** Tratamento de `DIAG_INCOMPLETE` (ir para processo faltante), `FINDINGS_FAILED` (mostrar `debug_id`), `DIAG_NOT_DRAFT`/`DIAG_ALREADY_SUBMITTED` (redirecionar para dashboard). Suporte a `?process_key=` na URL.
- **Resultados:** Tratamento de `cause_pending`; banner "Conclua as perguntas de causa abaixo"; callback `onPendingResolved` em CauseBlock.
- **Acoes:** Banner com ações obrigatórias do mecanismo; badge "Obrigatório"; tratamento de `MECHANISM_ACTION_REQUIRED` com `mechanism_action_keys`.
- **Dashboard:** Banner para `msg=diag_already_submitted`.
- **api.ts:** Campos `missing_process_keys`, `debug_id`, `message_user`, `mechanism_action_keys` no objeto de erro.

### Migrations

- 020: `full_cycle_history` — histórico de ciclos FULL
- 021: `full_fallback_honest_titles` — títulos honestos para fallbacks
- 022: `help_requests` — tabela de solicitações de ajuda
- 023: `full_cause_engine` — motor de causa (taxonomia, mecanismos)
- 024: `full_root_cause_schema` — full_gap_instances, full_cause_answers, full_gap_causes
- 025: `full_gap_instances_status` — status CAUSE_PENDING / CAUSE_CLASSIFIED
- 026: `full_value_events` — eventos de valor

### Documentação

- README: migrações 020–026, códigos de erro, ações obrigatórias do mecanismo
- FULL_QUESTION_BANK_API: submit (DIAG_INCOMPLETE, CATALOG_INVALID, FINDINGS_FAILED), GET /full/actions (mechanism_required_action_keys), POST /full/plan (MECHANISM_ACTION_REQUIRED)
- FULL_ROOT_CAUSE_BASELINE: full_gap_instances.status, validação de plano
- FULL_ROOT_CAUSE_SCHEMA: status em full_gap_instances, migration 025
- FULL_MODULE_SCHEMA: migrações 020–026, tabelas root cause
- E2E_FULL_FLOW: códigos de erro tratados
- ARCHITECTURE: fluxo FULL com validações
