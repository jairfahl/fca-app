# QA — Contrato GET /consultor/companies

## Testes de contrato (Jest)

```bash
cd apps/api && npx jest consultorEndpoints -t "GET /consultor/companies"
```

- CONSULTOR (mock auth) → 200
- USER (mock auth) → 403

## Smoke test (Node, API rodando)

```bash
node scripts/qa-verify-consultor-fix.js
```

Requer: API em `http://localhost:3001`, `.env` com `SUPABASE_URL`, `SUPABASE_ANON_KEY`.  
Usa `consultor@fca.com` e `fca@fca.com` (senha `senha123`).
