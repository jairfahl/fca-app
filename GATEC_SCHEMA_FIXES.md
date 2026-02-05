# Gate C: Ajustes de Schema para Robustez

---

Ultima atualizacao: 2026-02-04.
## Análise de Inconsistências

### Problemas Identificados

1. **Tabela `scores`**:
   - Migration inicial (`001_init.sql`): tem `category` e `score` (múltiplas linhas por assessment)
   - Código real (`assessments.js`, `f3.js`, `gateC.js`): usa `commercial, operations, admin_fin, management, overall` (uma linha por assessment)

2. **Tabela `companies`**:
   - Migration inicial: não tem `owner_user_id` nem `segment`
   - Código real: usa `owner_user_id` e `segment` extensivamente

3. **Tabela `assessments`**:
   - Migration inicial: `status` com valores lowercase ('draft', 'completed')
   - Código real: usa valores uppercase ('DRAFT', 'COMPLETED')
   - Migration inicial: não tem `type`
   - Código real: usa `type` ('LIGHT', 'FULL')

4. **Tabela `assessment_items`**:
   - Migration inicial: tem `category, question, score, order_index`
   - Código real: usa `process, activity, score_int` com constraint `(assessment_id, process, activity)`

## Correções Aplicadas

### Migration `002_f2_schema_fixes.sql`

Criada migration idempotente que:

1. **Adiciona `owner_user_id` e `segment` em `companies`** (se não existirem)
2. **Adiciona `type` em `assessments`** (se não existir)
3. **Ajusta `status` em `assessments`** para aceitar ambos lowercase e uppercase
4. **Adiciona colunas por processo em `scores`** (`commercial, operations, admin_fin, management, overall`) se ainda não existirem
5. **Adiciona colunas `process, activity, score_int` em `assessment_items`** se ainda não existirem

### Schema Real Usado pelo Código

#### `public.scores`
```sql
assessment_id UUID PRIMARY KEY
commercial NUMERIC(4,2)
operations NUMERIC(4,2)
admin_fin NUMERIC(4,2)
management NUMERIC(4,2)
overall NUMERIC(4,2)
UNIQUE (assessment_id)  -- uma linha por assessment
```

#### `public.companies`
```sql
id UUID PRIMARY KEY
name TEXT NOT NULL
owner_user_id UUID REFERENCES auth.users(id)
segment TEXT CHECK (segment IN ('SERVICOS', 'COMERCIO', 'INDUSTRIA'))
-- ... outras colunas
```

#### `public.assessments`
```sql
id UUID PRIMARY KEY
company_id UUID NOT NULL
type TEXT CHECK (type IN ('LIGHT', 'FULL')) DEFAULT 'LIGHT'
status TEXT CHECK (status IN ('DRAFT', 'COMPLETED', ...))
-- ... outras colunas
```

#### `public.assessment_items`
```sql
id UUID PRIMARY KEY
assessment_id UUID NOT NULL
process TEXT NOT NULL
activity TEXT NOT NULL
score_int INTEGER CHECK (score_int >= 0 AND score_int <= 10)
UNIQUE (assessment_id, process, activity)
```

#### `public.full_assessment_initiatives`
```sql
assessment_id UUID NOT NULL
initiative_id UUID NOT NULL
rank INT CHECK (rank BETWEEN 1 AND 12)
process TEXT CHECK (process IN ('COMERCIAL','OPERACOES','ADM_FIN','GESTAO'))
PRIMARY KEY (assessment_id, initiative_id)
UNIQUE (assessment_id, rank)
```

#### `public.full_initiatives_catalog`
```sql
id UUID PRIMARY KEY
process TEXT NOT NULL
segment TEXT NOT NULL
title TEXT NOT NULL
rationale TEXT NOT NULL
impact TEXT CHECK (impact IN ('HIGH','MED','LOW'))
horizon TEXT CHECK (horizon IN ('CURTO','MEDIO'))
prerequisites_json JSONB DEFAULT '[]'
dependencies_json JSONB DEFAULT '[]'
trigger_json JSONB DEFAULT '{}'
active BOOLEAN DEFAULT true
created_at TIMESTAMPTZ
```

## Validação do Código Gate C

### Endpoint `GET /full/assessments/:id/summary`

✅ **Uso correto de schema**:
- `scores`: busca `commercial, operations, admin_fin, management, overall` ✓
- `companies`: busca `id, owner_user_id, name` ✓
- `assessments`: busca `id, company_id` ✓
- `full_assessment_initiatives`: busca `rank, initiative_id, process` ✓
- `full_initiatives_catalog`: busca `id, title, rationale, impact, horizon, dependencies_json` ✓

### Endpoint `GET /full/assessments/:id/next-best-actions`

✅ **Uso correto de schema**:
- `full_assessment_initiatives`: busca `rank, initiative_id, process` ✓
- `full_initiatives_catalog`: busca `id, title, dependencies_json` ✓

## Aplicação da Migration

Para aplicar a migration de correção:

```bash
cd ~/Downloads/fca-mtr
npm run db:migrate
```

A migration é **idempotente** (usa `IF NOT EXISTS` e verifica existência de colunas), então pode ser executada múltiplas vezes sem problemas.

## Resultado Esperado

Após aplicar a migration:

1. ✅ Schema alinhado com uso real do código
2. ✅ Endpoints Gate C funcionando corretamente
3. ✅ Compatibilidade mantida com dados existentes
4. ✅ Sem quebra de funcionalidade existente

## Observações

- A migration **não remove** colunas antigas (`category`, `question`, etc.) para manter compatibilidade
- A migration **adiciona** novas colunas apenas se não existirem
- O código Gate C já está usando o schema correto (baseado no uso em `assessments.js` e `f3.js`)

## Documentação Relacionada

- `README.md`: Visão geral do projeto e estrutura de migrações
- `F4_DOCUMENTATION.md`: Documentação completa do F4, F4B e Gate C
- `GATEC_NEXT_BEST_ACTIONS.md`: Documentação do endpoint next-best-actions
- `scripts/GATEC_EVIDENCE_README.md`: Guia dos scripts de evidência para Gate C
