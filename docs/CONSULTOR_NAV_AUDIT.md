# Audit de navegação do módulo CONSULTOR

**Data:** 2025-02-19  
**Última atualização:** 2025-02-19 (rotas padronizadas — Prompt 3)  
**Escopo:** Navegação, listagens, DTO, exibição (labels). Sem alterar regras de negócio.

---

## 1. Rotas padronizadas (atual)

| Rota | Descrição |
|------|-----------|
| `/consultor` | Home do consultor (empresas, usuários, pedidos de ajuda) |
| `/consultor/companies` | Lista de empresas (link "Abrir" → overview) |
| `/consultor/company/[company_id]/overview` | Overview da empresa (Diagnósticos, Usuários, Mensagens, Relatórios) |
| `/consultor/company/[company_id]` | Redirect → `/consultor/company/[company_id]/overview` |
| `/consultor/companies/[company_id]` | Redirect → `/consultor/company/[company_id]/overview` |
| `/consultor/company/[company_id]/assessment/[assessment_id]` | Detalhe do assessment (leitura) |
| `/consultor/company/[company_id]/historico` | Histórico de versões FULL |
| `/consultor/company/[company_id]/relatorio` | Relatório PDF |
| `/consultor/user/[user_id]?company_id=` | Usuário (company_id obrigatório) |
| `/consultor/light/[assessment_id]?company_id=` | Diagnóstico LIGHT (leitura) |
| `/consultor/full/[assessment_id]?company_id=` | Diagnóstico FULL (leitura) |
| `/consultor/messages` | Mensagens |
| `/full/consultor` | Redirect → `/consultor` (CONSULTOR nunca navega aqui; RoleGate redireciona antes) |

**Regras:**
- Nenhum link gera `company_id=undefined` (consultorRoutes retorna `#` para ids inválidos).
- RoleGate: CONSULTOR em rota que não começa com `/consultor` → redirect para `/consultor?msg=acesso_consultor_painel`.
- Histórico/Relatório: se `company_id` inválido, exibe "Selecione uma empresa válida." + link "Voltar ao painel".

---

## 2. Diagrama textual do fluxo

```
/consultor (home)
├── Tab "Empresas"
│   ├── Lista: companies (GET /consultor/companies)
│   ├── Link: /consultor/company/{company_id}/overview
│   └── Empty: "Nenhuma empresa encontrada"
├── Tab "Pedidos de apoio"
│   ├── Lista: support/requests (GET /consultor/support/requests)
│   ├── Link: /consultor/company/{company_id}/overview
│   └── Empty: "Nenhum pedido de apoio..."
└── Cards: /consultor/companies, /consultor/messages

/consultor/companies
├── Lista: consultantCompanies()
├── Link: /consultor/company/{company_id}/overview
└── Redirect /consultor/companies/{id} → /consultor/company/{id}/overview

/consultor/company/[company_id]/overview
├── GET /consultor/company/:id/overview
├── GET /consultor/assessments?company_id=
├── GET /consultor/companies (para companyDetail)
├── Link: /consultor/company/{id}/assessment/{assessment_id}
├── Link: /consultor/company/{id}/historico
├── Link: /consultor/company/{id}/relatorio
└── Back: /consultor

/consultor/company/[company_id]/assessment/[assessment_id]
├── GET /consultor/assessment/:id/summary?company_id=
├── GET /consultor/messages?company_id=
└── Back: /consultor/company/{id}/overview

/consultor/user/[user_id]?company_id=
├── GET /consultor/users/:user_id/diagnosticos?company_id=
├── GET /consultor/messages?company_id=&user_id=
├── Sem company_id → erro "company_id é obrigatório"
└── Link: /consultor/company/{company_id}/overview
```

---

## 3. Endpoints usados e payloads esperados

### Backend (apps/api/src/routes/consultor.js)

| Método | Rota | Payload/Query | Resposta |
|--------|------|---------------|----------|
| GET | `/consultor/users` | `page`, `limit` | `{ users, pagination }` |
| GET | `/consultor/users/:user_id/diagnosticos` | `company_id` (query) | `{ user_id, company_id, light[], full[] }` |
| GET | `/consultor/companies` | `limit`, `offset` | `{ companies: [{ company_id, name, owner_user_id, entitlement, full_status, ... }] }` |
| GET | `/consultor/companies/:id/diagnostics` | — | `{ company_id, light[], full[] }` |
| GET | `/consultor/companies/:id/diagnostics/:assessment_id` | — | `DiagnosticDetail` |
| GET | `/consultor/assessments` | `company_id` | `{ company_id, light[], full[] }` |
| GET | `/consultor/assessment/:id/summary` | `company_id` (query) | `SummaryData` |
| GET | `/consultor/company/:id/overview` | — | `{ company, light_status, full_status, full_assessment_id, plan_progress }` |
| GET | `/consultor/company/:id/actions` | — | `{ actions[], evidence[] }` |
| GET | `/consultor/help-requests` | `status` | `{ help_requests[] }` |
| GET | `/consultor/messages` | `company_id`, `user_id`, `unread` | `{ messages[] }` |
| POST | `/consultor/messages/reply` | `{ company_id, to_user_id, body }` | 201 + msg |
| GET | `/consultor/support/requests` | `status` | `{ requests[] }` |
| PATCH | `/consultor/support/requests/:id` | `{ status }` | 200 |
| GET | `/consultor/support/threads` | `status` | `{ threads[] }` |
| GET | `/consultor/support/threads/:id` | — | `{ thread, messages[] }` |
| POST | `/consultor/support/threads/:id/close` | — | 200 |
| POST | `/consultor/help-requests/:id/close` | — | 200 |

### Full (apps/api/src/routes/full.js)

| Método | Rota | Payload | Resposta |
|--------|------|---------|----------|
| GET | `/full/consultor/assessments/:id` | `company_id` (query) | `ConsultantData` |
| PATCH | `/full/consultor/assessments/:id/actions/:key/notes` | body | 200 |

---

## 4. Plano de correção (concluído — Prompt 3)

| Ação | Status |
|------|--------|
| Padronizar rota empresa para `/consultor/company/:id/overview` | ✅ |
| RoleGate: redirect CONSULTOR com `msg=acesso_consultor_painel` | ✅ |
| Lista empresas: link para overview (não mais `/consultor/companies/:id`) | ✅ |
| Redirect `/consultor/companies/:id` → overview | ✅ |
| Histórico/Relatório: mensagem "Selecione uma empresa válida" | ✅ |
| Nenhum link gera `company_id=undefined` | ✅ |

---

## 5. Checklist de impactos

- [x] `full/consultor`: página redireciona para `/consultor`; RoleGate redireciona CONSULTOR antes de chegar.
- [x] Unificar company vs companies: `/consultor/companies/:id` redireciona para `/consultor/company/:id/overview`.
- [ ] Página user: depende de GET `/consultor/users` ou endpoint com email; exibir `email || userId`.
- [x] Testes: `consultorRoutes.test.ts` cobre rotas; consultor nunca navega para `/full/consultor`.
