# QA: RoleGate e eliminação do loop de redirects

## Objetivo

Validar que:
- CONSULTOR é sempre direcionado para `/consultor`
- USER não acessa `/consultor`
- `/me` é chamado **uma vez** por sessão (sem flood no Network)
- Não há loop de redirects
- Comportamento consistente após refresh

## Pré-requisitos

- Usuários de teste: `consultor@fca.com`, `fca@fca.com` (senha em `.env` ou `scripts/create-test-users.js`)
- API rodando em `localhost:3001`
- Web rodando em `localhost:3000`

## Passo a passo manual

### 1. Logar como CONSULTOR

1. Abra o DevTools (F12) → aba **Network**
2. Filtre por `me` ou `Fetch/XHR`
3. Acesse `http://localhost:3000/login`
4. Faça login com `consultor@fca.com` e a senha configurada
5. Clique em **Entrar**

**Resultado esperado:**
- Redirecionamento para `/consultor`
- Na aba Network: **exatamente 1** requisição para `/me` (durante o login)
- Não devem existir requisições de diagnóstico (`/assessments`, `/full/*`, etc.)
- URL final: `http://localhost:3000/consultor`

### 2. Tentar acessar /diagnostico como CONSULTOR (URL direta)

1. Com o consultor logado, digite na barra de endereço: `http://localhost:3000/diagnostico`
2. Pressione Enter

**Resultado esperado:**
- Redirecionamento imediato para `/consultor`
- Tela "Redirecionando..." por um instante (não questionário)
- Não devem existir novas requisições `/me` (usa cache)
- Não devem existir requisições de diagnóstico

### 3. Verificar ausência de flood de /me

1. Com o consultor logado em `/consultor`
2. Navegue: `/consultor` → `/consultor/company/[id]` → voltar
3. Faça refresh (F5) na página `/consultor`

**Resultado esperado:**
- No Network: no máximo 1–2 chamadas `/me` (uma no login, eventualmente uma no refresh)
- Não deve haver dezenas de chamadas `/me`

### 4. Logar como USER e verificar bloqueio em /consultor

1. Faça logout (ou use aba anônima)
2. Faça login com `fca@fca.com`
3. Digite na barra de endereço: `http://localhost:3000/consultor`
4. Pressione Enter

**Resultado esperado:**
- Redirecionamento para `/diagnostico`
- USER não permanece em `/consultor`

### 5. Comportamento após refresh

1. Com consultor logado em `/consultor`
2. Pressione F5 (refresh)

**Resultado esperado:**
- Página recarrega e permanece em `/consultor`
- Sem loop (não alterna entre URLs)
- `/me` chamado uma vez para popular o cache

## Logs de desenvolvimento

Com `NODE_ENV !== 'production'`, o console deve mostrar:

- `[ME_FETCH] count=1 role=CONSULTOR` — ao carregar /me
- `[ROLE_REDIRECT] from=/diagnostico to=/consultor role=CONSULTOR count=1` — ao redirecionar

## Smoke test (se existir E2E)

Se o repositório tiver testes E2E (Playwright, Cypress, etc.):

1. Adicionar cenário: login como consultor → verificar URL final `/consultor`
2. Adicionar cenário: consultor acessa `/diagnostico` via URL → verificar redirect para `/consultor`
3. Adicionar cenário: verificar que a contagem de requisições `/me` não excede 2 na sessão
