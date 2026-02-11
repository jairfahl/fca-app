# Catálogo canônico FULL

Conteúdo versionado para o módulo FULL do diagnóstico aprofundado.

## Arquivos

| Arquivo | Descrição |
|---------|-----------|
| `processes.json` | Estrutura Área → Processo com microvalor: protects, owner_alert, typical_impact |
| `questions.json` | Perguntas por processo (mais profundas que LIGHT), com dimension e segment_applicability |
| `recommendations.json` | Recomendações por banda (LOW/MEDIUM/HIGH) e processo |
| `actions.json` | Ações por banda e processo, com benefit_text, metric_hint, dod_checklist |

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
