# Módulo ADMIN — Gestão de Usuários (SoD)

Módulo de gestão de usuários (Separation of Duties). Somente ADMIN acessa os endpoints.

## Pré-requisitos

- JWT de usuário com `app_metadata.role = ADMIN`
- `SUPABASE_SERVICE_ROLE_KEY` no backend (para alterar Auth e tabelas)
- Migration `034_user_profiles.sql` aplicada

## Endpoints

Base URL: `{API_URL}` (ex: `http://localhost:3001`)

### 1) POST /admin/users/role

Define a role global de um usuário (USER, CONSULTOR, ADMIN).

**Body:**
```json
{
  "email": "usuario@exemplo.com",
  "role": "USER"
}
```

**Roles válidas:** `USER`, `CONSULTOR`, `ADMIN`

**Ação:**
- Localiza usuário no Auth por email
- Atualiza `app_metadata.role` no Supabase Auth
- Upsert em `public.user_profiles`

**Exemplo curl:**
```bash
curl -X POST http://localhost:3001/admin/users/role \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"email":"consultor@fca.com","role":"CONSULTOR"}'
```

**Resposta 200:**
```json
{
  "user_id": "uuid",
  "email": "consultor@fca.com",
  "role": "CONSULTOR"
}
```

---

### 2) GET /admin/users

Lista usuários (user_profiles) com paginação e busca.

**Query params:**
- `query` (opcional): busca em email e role (case-insensitive)
- `limit` (opcional, default 50, max 100)
- `offset` (opcional, default 0)

**Exemplo curl:**
```bash
curl "http://localhost:3001/admin/users?query=fca&limit=20&offset=0" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**Resposta 200:**
```json
{
  "users": [
    {
      "user_id": "uuid",
      "email": "fca@fca.com",
      "role": "USER",
      "updated_at": "2025-02-19T..."
    }
  ],
  "total": 1
}
```

---

### 3) POST /admin/companies/:company_id/members

Adiciona ou atualiza membership de usuário em empresa.

**Body:**
```json
{
  "email": "usuario@exemplo.com",
  "member_role": "MEMBER",
  "status": "ACTIVE"
}
```

**member_role:** `OWNER` ou `MEMBER`  
**status:** `ACTIVE` ou `INACTIVE`

**Exemplo curl:**
```bash
curl -X POST "http://localhost:3001/admin/companies/$COMPANY_ID/members" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"email":"fca@fca.com","member_role":"OWNER","status":"ACTIVE"}'
```

**Resposta 201:**
```json
{
  "company_id": "uuid",
  "user_id": "uuid",
  "member_role": "OWNER",
  "status": "ACTIVE",
  "created_at": "..."
}
```

---

### 4) DELETE /admin/companies/:company_id/members

Remove membership de usuário em empresa.

**Query params:**
- `email` (obrigatório): email do usuário

**Exemplo curl:**
```bash
curl -X DELETE "http://localhost:3001/admin/companies/$COMPANY_ID/members?email=usuario@exemplo.com" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**Resposta 204** (sem corpo)

---

### 5) POST /admin/companies/:company_id/consultant-access

Define acesso de consultor a uma empresa específica (para futura restrição de escopo).

**Body:**
```json
{
  "email": "consultor@fca.com",
  "access_level": "READ"
}
```

**access_level:** `READ` ou `SUPPORT`

**Exemplo curl:**
```bash
curl -X POST "http://localhost:3001/admin/companies/$COMPANY_ID/consultant-access" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"email":"consultor@fca.com","access_level":"SUPPORT"}'
```

**Resposta 201:**
```json
{
  "consultant_user_id": "uuid",
  "company_id": "uuid",
  "access_level": "SUPPORT",
  "created_at": "..."
}
```

---

## Bootstrap (ambiente de testes)

Para garantir roles corretos sem SQL manual:

```bash
npm run auth:bootstrap
```

Garante:
- `admin@fca.com` → ADMIN
- `consultor@fca.com` → CONSULTOR
- `fca@fca.com` → USER

Também faz upsert em `user_profiles` (requer migration 034).

**Senha padrão:** `senha123` (ou `TEST_PASSWORD` no .env)

---

## Auditoria

Eventos registrados em `audit_events`:

| action | target_type | payload |
|--------|-------------|---------|
| ADMIN_SET_ROLE | user | email, role |
| ADMIN_SET_MEMBER | company_member | email, member_role, status (ou action: removed) |
| ADMIN_SET_CONSULTANT_ACCESS | consultant_company_access | email, access_level |

---

## Acesso

- **ADMIN:** acessa todos os endpoints
- **CONSULTOR:** 403 em /admin
- **USER:** 403 em /admin

Sem token ou token inválido: 401.
