# Smoke Test E2E — Módulo CONSULTOR

Roteiro manual determinístico para validar o módulo do consultor. **Tempo estimado: ~5 min.**

---

## Pré-requisitos

- API rodando (ex.: `http://localhost:3001`)
- Web rodando (ex.: `http://localhost:3000`)
- Usuário consultor: `consultor@fca.com` (senha configurada no Supabase)
- Banco com ao menos 1 empresa e 1 usuário (owner) vinculado

---

## Roteiro

### 1. Login

1. Acesse `/login`
2. Faça login com `consultor@fca.com`
3. **Verificação:** Redirecionamento para `/consultor` (não para `/diagnostico`)

| Endpoint | Método | Status esperado |
|----------|--------|-----------------|
| `/me` | GET | 200 |
| `/auth/v1/token?grant_type=password` (Supabase) | POST | 200 |

---

### 2. Home do consultor (`/consultor`)

1. Confirme que está em `/consultor`
2. **Verificação:** Abas visíveis: Empresas | Usuários | Pedidos de ajuda
3. **Verificação:** Aba Empresas — ao menos 1 empresa na tabela (nome ou ID visível)
4. **Verificação:** Aba Usuários — ao menos 1 usuário com email visível

| Endpoint | Método | Status esperado |
|----------|--------|-----------------|
| `/consultor/companies` | GET | 200 |
| `/consultor/users` | GET | 200 |
| `/consultor/help-requests?status=OPEN` | GET | 200 |
| `/consultor/support/requests?status=OPEN` | GET | 200 |

---

### 3. Empresa overview (`/consultor/company/:company_id/overview`)

1. Na aba Empresas, clique em "Ver detalhes →" ou em uma empresa (ou em /consultor/companies, clique em "Abrir →")
2. **Verificação:** URL no formato `/consultor/company/{uuid}/overview`
3. **Verificação:** Abas visíveis: Diagnósticos | Usuários | Mensagens | Relatórios
4. **Verificação:** KPIs (Entitlement, LIGHT, FULL) exibidos
5. **Verificação:** Seção Diagnósticos — lista LIGHT e/ou FULL (ou "Nenhum diagnóstico encontrado")

| Endpoint | Método | Status esperado |
|----------|--------|-----------------|
| `/consultor/company/:id/overview` | GET | 200 |
| `/consultor/assessments?company_id=:id` | GET | 200 |
| `/consultor/companies` | GET | 200 |
| `/consultor/users?company_id=:id` | GET | 200 |
| `/consultor/messages?company_id=:id` | GET | 200 |

---

### 4. Usuário (`/consultor/user/:user_id?company_id=:company_id`)

1. Na empresa, clique em "Ver usuário responsável →" ou vá à aba Usuários e clique em "Ver usuário →"
2. **Verificação:** URL contém `company_id` na query
3. **Verificação:** Abas: Diagnósticos | Mensagens (e Ações/Plano se houver FULL)
4. **Verificação:** Diagnósticos LIGHT e FULL listados (ou mensagem de vazio)

| Endpoint | Método | Status esperado |
|----------|--------|-----------------|
| `/consultor/users/:user_id/diagnosticos?company_id=:id` | GET | 200 |
| `/consultor/messages?company_id=:id&user_id=:user_id` | GET | 200 |

---

### 5. Pedidos de ajuda — Fechar pedido

1. Volte ao home (`/consultor`)
2. Aba "Pedidos de ajuda"
3. **Verificação:** Lista de pedidos abertos (ou "Nenhum pedido de apoio aberto")
4. Se houver pedido: clique em "Fechar"
5. **Verificação:** Pedido some da lista (ou feedback de sucesso)

| Endpoint | Método | Status esperado |
|----------|--------|-----------------|
| `/consultor/help-requests?status=OPEN` | GET | 200 |
| `/consultor/help-requests/:id/close` | POST | 200 |

---

## Evidência mínima

Registrar em cada execução:

| Ponto | OK? | Observação |
|-------|-----|------------|
| Login → /consultor | ☐ | |
| Home: 1+ empresa | ☐ | |
| Home: 1+ usuário com email | ☐ | |
| Empresa overview carrega | ☐ | |
| Usuário carrega (com company_id) | ☐ | |
| Diagnósticos LIGHT/FULL visíveis | ☐ | |
| Pedidos de ajuda listados | ☐ | |
| Fechar pedido funciona | ☐ | |

**Endpoints sem 500/404:** Todos os GET/POST acima devem retornar 200 (ou 201 para POST). Em caso de 403, verificar role do usuário.

---

## DevTools — Network

Durante o teste, abra DevTools → Network e confira:

- Nenhum 500 nas chamadas à API
- Nenhum 404 em rotas `/consultor/*`
- Chamadas a `/me` não em loop (cache ativo)

---

## Fallbacks aceitáveis

- **0 empresas / 0 usuários:** Tela mostra "Nenhuma empresa encontrada" ou similar — OK se API retornar 200 com array vazio
- **0 pedidos de ajuda:** Não é possível testar "Fechar pedido" — registrar como N/A
- **Sem FULL:** Botões Histórico/Relatório desabilitados com tooltip "Sem FULL ainda" — OK
