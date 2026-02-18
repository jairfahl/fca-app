# Catálogo canônico FULL

Conteúdo versionado para o módulo FULL do diagnóstico aprofundado.

## Arquivos

| Arquivo | Descrição |
|---------|-----------|
| `processes.json` | Estrutura Área → Processo com microvalor: protects, owner_alert, typical_impact |
| `questions.json` | Perguntas por processo (mais profundas que LIGHT), com dimension e segment_applicability |
| `recommendations.json` | Recomendações por banda (LOW/MEDIUM/HIGH) e processo |
| `actions.json` | Ações por banda e processo, com benefit_text, metric_hint, dod_checklist |
| `catalog.v1.json` | Catálogo v1 (processo + nivel + sinais): recomendação + ação por item |

## Catálogo v1 (catalog.v1.json)

Formato determinístico por `process_key` + `nivel_ui` + `signals`:

- **process_key**: COMERCIAL | OPERACOES | ADM_FIN | GESTAO
- **nivel_ui**: CRITICO | EM_AJUSTE | SOB_CONTROLE (map: CRITICO→LOW, EM_AJUSTE→MEDIUM, SOB_CONTROLE→HIGH)
- **signals**: 3–5 ids de perguntas (ex.: COMERCIAL_Q03) que explicam a recomendação
- **recommendation**: title, what_is_happening, cost_of_not_acting, change_in_30_days
- **action**: action_key, title, steps_3 (exatamente 3), owner_suggested, metric_suggested, done_when (2–5)

### Validar

```bash
npm run catalog:validate:full
```

Valida: enums, coerência nivel_ui↔band_backend, signals existentes em questions.json, ids únicos, action_key único por processo, steps_3 exatamente 3, done_when 2–5.

## Regras

- **Catálogo fechado**: nada de "inventar texto" em runtime.
- **Microvalor obrigatório**: cada processo tem protects_dimension, protects_text, owner_alert_text, typical_impact_text.
- **segment_applicability**: C/I/S define quais processos e perguntas aparecem por segmento.

## Seed

```bash
npm run db:seed:full
```

(Ou `node db/seed/seed-full-catalog.js` diretamente.)

O seed carrega esses JSONs e popula/atualiza as tabelas:

- `full_process_catalog`
- `full_question_catalog`
- `full_recommendation_catalog`
- `full_action_catalog`
