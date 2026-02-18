# Métricas FULL — Valor Inevitável

Métricas mínimas de observabilidade para o ciclo FULL: causa classificada, plano criado, ganho declarado e % de ciclos com ganho.

## Eventos instrumentados

| Evento | Quando | Tabela |
|--------|--------|--------|
| `CAUSE_CLASSIFIED` | Causa primária persistida em `full_gap_causes` (via POST /full/causes/answer ou submit) | `full_value_events` |
| `PLAN_CREATED` | Plano de 3 ações salvo (POST /full/plan ou POST /full/cycle/select-actions) | `full_value_events` |
| `GAIN_DECLARED` | Evidência com Antes/Depois registrada (POST evidence) | `full_value_events` |

## % Ciclos com ganho declarado

Derivado de `full_assessments` + `full_action_evidence`:

- **Total fechados**: `full_assessments` com `status = 'CLOSED'`
- **Com ganho**: assessments fechados que têm ao menos 1 registro em `full_action_evidence` com `declared_gain` preenchido
- **Percentual**: `(com_ganho / total_fechados) * 100`

## Consulta

### Script (padrão repo)

```bash
node scripts/full-value-metrics.js
```

Requer `DATABASE_URL` no `.env`. Saída:

```
=== Métricas FULL — valor inevitável ===

Eventos (full_value_events):
  Causa classificada:     N
  Plano 30 dias criado:  N
  Ganho declarado:       N

% ciclos com ganho declarado:
  Ciclos fechados:       N
  Com ganho declarado:   N
  Percentual:            X%
```

### Migração

A tabela `full_value_events` é criada pela migration `026_full_value_events.sql`. Execute as migrations antes de usar o script.

### Queries SQL diretas

```sql
-- Contagem por evento
SELECT event, COUNT(*) FROM public.full_value_events GROUP BY event;

-- % ciclos com ganho
WITH closed AS (
  SELECT id FROM public.full_assessments WHERE status = 'CLOSED'
),
with_gain AS (
  SELECT DISTINCT e.assessment_id
  FROM public.full_action_evidence e
  JOIN closed c ON c.id = e.assessment_id
  WHERE e.declared_gain IS NOT NULL AND e.declared_gain != ''
)
SELECT
  (SELECT COUNT(*) FROM closed) AS total_closed,
  (SELECT COUNT(*) FROM with_gain) AS cycles_with_gain;
```

## Mecanismo

- **Tabela**: `full_value_events` (padrão `paywall_events`)
- **Inserção**: fire-and-forget em `apps/api/src/lib/fullValueEvents.js`
- **Regras**: eventos não bloqueiam fluxo; falha de insert só gera log
