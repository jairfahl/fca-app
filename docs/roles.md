# Roles e Área do Consultor

## Roles

| Role | Descrição |
|------|-----------|
| USER | Fluxo normal do app (diagnóstico, ações, evidências). Pode solicitar ajuda. |
| CONSULTOR | Acesso transversal: vê qualquer empresa, status, ações, evidências. Área em `/consultor`. |
| ADMIN | Infra/testes. Mesmo comportamento de CONSULTOR (mínimo viável). |

**Fonte da verdade:** `user.app_metadata.role` ou `user.user_metadata.role` no JWT.  
**Fallback:** se não existir role, assume `USER`.

## Configuração de roles no Supabase

Definir `app_metadata.role` via Dashboard ou Admin API:

```js
// Exemplo via Supabase Admin API
await supabase.auth.admin.updateUserById(userId, {
  app_metadata: { role: 'CONSULTOR' }
});
```

**Credenciais de teste:**
- USER: fca@fca.com / senha123
- CONSULTOR: consultor@fca.com / senha123
- ADMIN: admin@fca.com / senha123

**Criar usuários de teste (recomendado):**
```bash
npm run auth:bootstrap
```
Cria/atualiza os três usuários via Auth API (senha `senha123`, roles em `app_metadata.role`).

**Empresa de teste para consultor (fca@fca.com):**
```bash
npm run db:seed:consultor
```
Cria empresa FCA para fca@fca.com se não existir. Necessário para que a home do consultor liste usuários.

**Garantir roles corretos (consultor@fca.com = CONSULTOR, etc.):**
```bash
# Opção 1: via Auth API
npm run auth:bootstrap

# Opção 2: via SQL (idempotente)
# Execute scripts/fix-auth-users-roles.sql no SQL Editor do Supabase
```

**Se o login retornar 500 "Database error querying schema":**
1. Rode `npm run auth:diagnose` para confirmar se é problema do Auth/schema (não credencial).
2. Execute `scripts/fix-auth-users-tokens.sql` no SQL Editor do Supabase (usuários criados via SQL podem ter colunas de token NULL).

## API

### GET /me
Requer Bearer token. Retorna:
```json
{
  "user_id": "uuid",
  "email": "email",
  "role": "USER|CONSULTOR|ADMIN"
}
```

### Guards
- `requireConsultorOrAdmin`: CONSULTOR ou ADMIN
- `requireAnyRole(['CONSULTOR','ADMIN'])`
- `requireRole('ADMIN')`

### Endpoints /consultor/* (apenas CONSULTOR/ADMIN)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /consultor/companies | Lista empresas (id, name) |
| GET | /consultor/company/:company_id/overview | Visão consolidada (company, LIGHT, FULL, plano) |
| GET | /consultor/company/:company_id/actions | Ações + evidências do ciclo |
| GET | /consultor/help-requests?status=OPEN | Pedidos de ajuda abertos |
| POST | /consultor/help-requests/:id/close | Fecha pedido |

### Help requests (USER cria)

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | /help-requests | Cria pedido (body: company_id, context) |

## Frontend

- **Pós-login:** USER → /onboarding; CONSULTOR/ADMIN → /consultor
- **Área consultor:** /consultor (home), /consultor/companies, /consultor/company/[company_id]/overview, /consultor/user/[user_id]?company_id=, /consultor/company/[company_id]/historico, /consultor/company/[company_id]/relatorio
- **USER:** botão "Solicitar ajuda" em dashboard, resultados, ações
- **USER:** sem link "Visão consultor" no fluxo
