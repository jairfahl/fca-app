# API: Auth e Guards (Prompt 2)

## Resumo

- **GET /me**: retorna `user_id`, `email`, `role` do JWT (backend é fonte de verdade).
- **blockConsultorOnMutation**: bloqueia CONSULTOR em rotas de save/submit LIGHT/FULL; retorna 403 com `CONSULTOR_NOT_ALLOWED`.
- **Erros padronizados**: 401 `UNAUTHENTICATED`, 403 `CONSULTOR_NOT_ALLOWED` ou `FORBIDDEN`.

## Testes rápidos (curl)

Obter tokens via login Supabase (ou `scripts/create-test-users.js` + sign in):

```bash
# 1) Login consultor
curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"consultor@fca.com","password":"senha123"}' | jq -r '.access_token'

# 2) Login user
curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"fca@fca.com","password":"senha123"}' | jq -r '.access_token'
```

### GET /me (token consultor) => 200 role CONSULTOR

```bash
TOKEN_CONSULTOR="<access_token do consultor>"
curl -s -H "Authorization: Bearer $TOKEN_CONSULTOR" http://localhost:3001/me | jq
# Esperado: { "user_id": "...", "email": "consultor@fca.com", "role": "CONSULTOR" }
```

### POST /assessments/light (token consultor) => 403

```bash
TOKEN_CONSULTOR="<access_token do consultor>"
curl -s -X POST http://localhost:3001/assessments/light \
  -H "Authorization: Bearer $TOKEN_CONSULTOR" \
  -H "Content-Type: application/json" \
  -d '{"company_id":"00000000-0000-0000-0000-000000000001"}' | jq
# Esperado: 403 { "error": "CONSULTOR_NOT_ALLOWED", "message_user": "Acesso de consultor é pelo painel do consultor." }
```

### POST /assessments/light (token user) => 200 ou 403 (por company)

```bash
TOKEN_USER="<access_token do fca@fca.com>"
curl -s -X POST http://localhost:3001/assessments/light \
  -H "Authorization: Bearer $TOKEN_USER" \
  -H "Content-Type: application/json" \
  -d '{"company_id":"<uuid da empresa do user>"}' | jq
# Esperado: 200 { "id": "...", "status": "DRAFT", ... } ou 403 se company não pertence
```

## Erros padronizados

| Status | error | Uso |
|--------|-------|-----|
| 401 | `UNAUTHENTICATED` | Token ausente ou inválido |
| 403 | `CONSULTOR_NOT_ALLOWED` | Consultor tentando save/submit LIGHT/FULL |
| 403 | `FORBIDDEN` | Role insuficiente ou sem acesso à company |
| 400 | `BAD_REQUEST` | UUID inválido, payload ausente |
