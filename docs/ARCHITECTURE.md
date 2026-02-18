# Arquitetura FCA-MTR

Documento consolidado de arquitetura e orientação para agentes. Para regras detalhadas por contexto, ver os arquivos `AGENTS.md` em cada pasta.

## Visão geral

```
fca-mtr/
├── apps/
│   ├── api/          # Backend Express (porta 3001)
│   │   └── AGENTS.md # Regras de backend
│   └── web/          # Frontend Next.js (porta 3000)
│       └── AGENTS.md # Regras de frontend
├── db/
│   ├── migrations/   # Migrações SQL idempotentes
│   └── seed/         # Seeds (catálogos, recomendações)
├── docs/             # Contratos de API e documentação
│   ├── AGENTS.md     # Regras de produto FULL
│   └── *.md          # Contratos por feature
├── catalogs/full/    # Catálogo canônico FULL (JSON)
├── AGENTS.md         # Instruções-mãe (raiz)
└── .cursor/rules/    # Regras Cursor (derivadas dos AGENTS)
```

## Princípios inegociáveis

| Princípio | Descrição |
|-----------|-----------|
| **Fonte de verdade** | BANCO + backend. Frontend apenas consulta e renderiza. |
| **Correção de bugs** | Nunca consertar só a UI; corrigir backend/contrato primeiro. |
| **Mudanças mínimas** | Sem refatoração estética; contrato claro e teste. |
| **Linguagem PME** | Proibido jargão na UI; usar `uiCopy.ts` para traduções. |

## Camadas

### Backend (apps/api)
- **Stack**: Node.js, Express, CommonJS
- **Rotas**: `/light/*` (diagnóstico rápido), `/full/*` (diagnóstico completo)
- **Persistência**: Supabase/PostgreSQL
- **Autenticação**: Supabase Auth, JWT (validação criptográfica)
- **Regras**: `apps/api/AGENTS.md`

### Frontend (apps/web)
- **Stack**: Next.js 14 (App Router), TypeScript, React
- **API client**: único em `src/lib/api.ts`
- **Copy**: `src/lib/uiCopy.ts` (traduções de enums para texto legível)
- **Regras**: `apps/web/AGENTS.md`

### Banco de dados
- **Migrações**: `db/migrations/*.sql` (idempotentes)
- **Schema FULL**: `docs/FULL_MODULE_SCHEMA.md`
- **Catálogo**: `catalogs/full/*.json` → seed via `npm run db:seed:full`

## Fluxos principais

### LIGHT (diagnóstico rápido)
1. `/diagnostico` → 12 perguntas → submit
2. `/results` → scores + recomendações
3. `/recommendations` → seleção de 4 ações (1 por processo)
4. Evidência write-once por ação

### FULL (diagnóstico completo)
1. Gate: entitlement checado no backend
2. `/full/wizard` → 4 processos × 12 perguntas → submit (valida DIAG_INCOMPLETE, CATALOG_INVALID, FINDINGS_FAILED)
3. `/full/resultados` → 3 vazamentos + 3 alavancas; perguntas de causa pendentes (CAUSE_PENDING) antes de assinar plano
4. `/full/acoes` → plano mínimo (3 ações); exige 1 ação do mecanismo quando há causa classificada (MECHANISM_ACTION_REQUIRED)
5. `/full/dashboard` → execução + evidência antes/depois
6. Ciclo: close → new-cycle

## Regras Cursor (.cursor/rules/)

As regras em `.cursor/rules/` são aplicadas automaticamente pelo Cursor:

| Arquivo | Escopo | Descrição |
|---------|--------|-----------|
| `00-project-core.mdc` | Sempre | Regras inegociáveis do projeto |
| `01-backend-api.mdc` | `apps/api/**` | Padrões de backend |
| `02-frontend-web.mdc` | `apps/web/**` | Padrões de frontend |
| `03-docs-contracts.mdc` | `docs/**`, `catalogs/**` | Contratos e regras de produto |

## Documentação relacionada

- `docs/FULL_MODULE_SCHEMA.md` — Schema do módulo FULL
- `docs/FULL_QUESTION_BANK_API.md` — Contrato de catálogo e perguntas
- `docs/FULL_ROOT_CAUSE_BASELINE.md` — Motor de causa e fluxo gap→causa→ação
- `docs/LIGHT_PLANS_API.md` — Contrato de planos Light
- `catalogs/full/README.md` — Catálogo canônico FULL
- `CHANGELOG.md` — Alterações notáveis
