# E2E — Fluxo FULL com causa

Teste end-to-end do ciclo completo FULL incluindo causa classificada, plano com 1 ação de mecanismo, evidência Antes/Depois e ganho declarado.

## Pré-requisitos

- API rodando (`npm run dev` ou `npm run dev --workspace=apps/api`)
- `.env` com:
  - `DATABASE_URL`
  - `TEST_EMAIL`, `TEST_PASSWORD` (para obter JWT)
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY` (para tmp_get_token)
- Migrations e seeds aplicados (`npm run db:migrate`, `npm run db:seed`, `npm run db:seed:cause-mvp`)

## Execução

```bash
npm run e2e:full
```

Ou com JWT explícito:

```bash
export JWT=$(node tmp_get_token.js)
npm run e2e:full
```

## Fluxo coberto

1. **DB fingerprint** — valida conexão com banco (GET /diagnostic/db-fingerprint)
2. **Start** — assessment novo (force_new=1)
3. **Answers** — diagnóstico completo (4 processos, respostas que produzem 3 vazamentos LOW)
4. **Submit** — status SUBMITTED
5. **Causes pending** — gaps pendentes de causa
6. **Cause answers** — resposta LIKERT_5 para cada gap (GAP_CAIXA_PREVISAO, GAP_VENDAS_FUNIL, GAP_ROTINA_GERENCIAL)
7. **Results** — 6 itens com gap+causa
8. **Plan** — 3 ações incluindo ADM_FIN-ROTINA_CAIXA_SEMANAL (mecanismo para CAUSE_RITUAL)
9. **DoD + Evidence** — confirmação DoD e evidência Antes/Depois
10. **Mark DONE** — status DONE
11. **Dashboard** — ganho declarado exibido
12. **Close cycle** — fechar ciclo
13. **Leitura** — dashboard fechado com ganhos declarados

## Códigos de erro tratados

- **DIAG_INCOMPLETE** (400): faltam respostas; payload inclui `missing_process_keys`, `answered_count`, `total_expected`
- **MECHANISM_ACTION_REQUIRED** (400): plano sem ação do mecanismo; payload inclui `mechanism_action_keys`
- **FINDINGS_FAILED** (500): falha ao gerar findings; payload inclui `debug_id`
- **CATALOG_INVALID** (500): catálogo inconsistente

## Assertions

- Cada etapa valida resposta esperada
- Exit 0 = PASS, Exit 1 = FAIL
- Sem flakiness: dados determinísticos (respostas fixas, force_new)

## Alternativa: script bash

`scripts/test-full-flow.sh` — fluxo similar sem causa (curl + jq). Para fluxo com causa, use `npm run e2e:full`.
