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
- **Área consultor:** /consultor, /consultor/[company_id], /consultor/[company_id]/acoes
- **USER:** botão "Solicitar ajuda" em dashboard, resultados, ações
- **USER:** sem link "Visão consultor" no fluxo
