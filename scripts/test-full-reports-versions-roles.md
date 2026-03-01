# E2E — Relatórios, Versões, Comparação e Papéis

Testes end-to-end para relatórios PDF, versionamento FULL, comparação entre versões e guards de papel (USER / CONSULTOR / ADMIN).

## Pré-requisitos

- API rodando (`npm run dev`)
- `.env` com:
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY`
  - `TEST_EMAIL`, `TEST_PASSWORD` (USER: fca@fca.com)
  - Ou variáveis específicas: `USER_EMAIL`, `USER_PASSWORD`, `CONSULTOR_EMAIL`, `CONSULTOR_PASSWORD`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`
- Roles configurados: `node scripts/set-user-roles.js` (CONSULTOR e ADMIN)
- Migrations e seeds aplicados

## Execução

```bash
npm run e2e:reports
```

Ou:

```bash
node scripts/e2e-reports-versions-roles.js
```

Com company pré-existente:

```bash
export COMPANY_ID=<uuid>
npm run e2e:reports
```

## Cenários cobertos

### 1) USER
- Concluir FULL v1 (SUBMIT)
- Gerar PDF → baixar PDF (200, content-type application/pdf)
- Concluir ciclo (plan, evidence, CLOSE)
- Refazer diagnóstico → cria FULL v2
- Comparar v1 vs v2 (JSON consistente: from_version, to_version, evolution_by_process)

### 2) CONSULTOR
- Acessar lista de companies (GET /consultor/companies)
- Abrir company de USER
- Ver versões (GET /full/versions)
- Baixar relatório PDF

### 3) ADMIN
- Smoke test: acesso irrestrito (versions, consultant companies)

### 4) Guards
- USER em GET /consultor/companies → 403

## Checks técnicos

| Check | Esperado |
|-------|----------|
| PDF download | 200, Content-Type: application/pdf |
| Versões | Ordenadas por full_version desc, incremento correto |
| Comparação | JSON com from_version, to_version, evolution_by_process |
| Guard USER | 403 em /consultor/companies |

## data-testid (frontend)

Botões principais para testes de UI:
- `cta-generate-report` — Gerar relatório
- `cta-download-report` — Baixar relatório
- `cta-refazer-diagnostico` — Fazer novo diagnóstico
- `cta-compare` — Comparar com anterior
- `cta-open-version` — Abrir versão
- `cta-relatorio` — Relatório PDF (histórico)

## Saída esperada

```
[1/8] Obtendo tokens...
[OK] Tokens obtidos para USER, CONSULTOR, ADMIN
[2/8] Guard: USER em /consultor/companies -> 403
[OK] USER recebe 403 em /consultor/companies
...
[PASS] E2E reports, versions, comparison e roles concluído.
```

Exit 0 = PASS, Exit 1 = FAIL.
