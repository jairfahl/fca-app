# QA — Causa raiz do 500 em GET /consultor/companies

## Requisição

- **Método:** GET
- **Path:** `/consultor/companies`
- **Headers:** `Authorization: Bearer <token>` (consultor@fca.com)

## Resposta

- **Status:** 500 Internal Server Error
- **Body:**
```json
{ "error": "Erro ao listar empresas" }
```

## Stack trace / log do backend

```
[CONSULTOR_ACCESS] role=CONSULTOR endpoint=/companies company_id=- ts=2026-02-19T14:41:35.452Z
[CONSULTOR_ERROR] {
  "route": "GET /consultor/companies",
  "user_id": "4ac452d1-5ac5-4609-b0f9-f6a0b8f9fe66",
  "role": "CONSULTOR",
  "error_message": "column companies.trade_name does not exist",
  "error_stack": null,
  "phase": "companies_select",
  "supabase_code": "42703"
}
```

**PostgreSQL 42703** = `undefined_column` (coluna indefinida)

## Causa raiz

**Categoria: D) Query falhando por schema/coluna/tabela inexistente**

A query Supabase em `GET /consultor/companies` seleciona:

```sql
SELECT id, name, trade_name, owner_user_id, created_at FROM companies
```

A coluna `trade_name` **não existe** na tabela `public.companies` no banco de dados em uso. O erro ocorre na fase `companies_select`, antes de qualquer enriquecimento (full_assessments, entitlements).

**Arquivo:** `apps/api/src/routes/consultor.js` (linha ~213)  
**Handler:** `router.get('/companies', ...)`

## Evidência

Reprodução via:
```bash
node scripts/qa-repro-consultor-companies.js
```

Log gravado em `logs/consultor-error.json` e stdout do backend.
