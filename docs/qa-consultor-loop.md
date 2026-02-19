# QA: Loop em /consultor — Causa e Evidência

## Sintoma (reproduzível)
- Acessar `http://localhost:3000/consultor?...` fica em "Carregando..."
- Network: múltiplas chamadas repetidas para `GET /me` (200) + RSC repetindo
- Indica loop de render/fetch no frontend (não erro de API)

---

## 1. Mapeamento de redirects e guards

### Redirects para /consultor
| Arquivo | Linha | Motivo |
|---------|-------|--------|
| `apps/web/src/components/ProtectedRoute.tsx` | 44 | `isConsultorByEmail(user.email)` → consultor acessando rota não-consultor |
| `apps/web/src/components/ProtectedRoute.tsx` | 51 | `fetchMe` retorna CONSULTOR/ADMIN em rota não-consultor |
| `apps/web/src/components/ProtectedRoute.tsx` | 58 | `fetchMe` falha mas `isConsultorByEmail` → fallback |
| `apps/web/src/app/login/page.tsx` | 59, 67 | Login bem-sucedido com role CONSULTOR |

### Redirects para /login
| Arquivo | Linha | Motivo |
|---------|-------|--------|
| `apps/web/src/components/ProtectedRoute.tsx` | 29 | `!user` (não autenticado) |
| `apps/web/src/lib/api.ts` | 80 | 401 em qualquer chamada API |
| `apps/web/src/lib/apiAuth.ts` | 69 | 401 em chamada autenticada |

### Redirects para /full
| Arquivo | Linha | Motivo |
|---------|-------|--------|
| `apps/web/src/components/ConsultorGuard.tsx` | 39, 44 | `fetchMe` retorna USER (não CONSULTOR/ADMIN) |

### Outros redirects relevantes
| Arquivo | Linha | Target | Motivo |
|---------|-------|--------|
| `apps/web/src/app/consultor/page.tsx` | 68 | /onboarding | 403 em /consultor/users |
| `apps/web/src/app/consultor/[company_id]/page.tsx` | 50 | /full | 403 |
| `apps/web/src/app/full/consultor/page.tsx` | 124, 146, 168 | /full ou /login | Erro ou não-autenticado |

### Middleware
- **Não existe** `middleware.ts` em `apps/web`.

---

## 2. Mapeamento de chamadas a `/me`

| Arquivo | Linha | Quem chama | Condição |
|---------|-------|------------|----------|
| `apps/web/src/lib/api.ts` | 137-138 | `fetchMe()` | Função central — todas as chamadas passam por aqui |
| `apps/web/src/components/ConsultorGuard.tsx` | 32 | `useEffect` | Quando `authLoading=false`, `user` e `session.access_token` existem; não usa cache |
| `apps/web/src/components/ProtectedRoute.tsx` | 47 | `useEffect` | Quando **não** está em rota consultor (`/consultor`, `/full/consultor`, `/logout`) e não é consultor por email |
| `apps/web/src/app/login/page.tsx` | 64 | `handleLogin` | Após signIn, para decidir redirect (consultor vs onboarding) |
| `apps/web/src/app/full/resultados/page.tsx` | 118 | `load` | Em paralelo com fetch de results, para exibir role |

### Fluxo na página /consultor
1. **ProtectedRoute**: pathname começa com `/consultor` → `isConsultorRoute=true` → **não chama** `fetchMe`, apenas `setRoleChecked(true)`.
2. **ConsultorGuard**: pathname é `/consultor` → **chama** `fetchMe` no `useEffect` para validar role CONSULTOR/ADMIN.

**Conclusão**: Na rota `/consultor`, o único componente que chama `/me` é **ConsultorGuard**.

---

## 3. Instrumentação temporária

Foram adicionados logs para reprodução:

### Em `apps/web/src/lib/api.ts` (fetchMe)
- `[ME_FETCH] start count=N` e `[ME_FETCH] done count=N role=...`
- Contador: `window.__dbgMeCount`
- Throttle: loga nos primeiros 10 e a cada 20 chamadas

### Em `apps/web/src/components/ProtectedRoute.tsx`
- `[ROLE_REDIRECT] ProtectedRoute:pathname=... reason=... target=...` em cada redirect

### Em `apps/web/src/components/ConsultorGuard.tsx`
- `[CONSULTOR_GUARD] effect run count=N` no início do `useEffect`
- Contador: `window.__dbgCgRun`
- Throttle: primeiros 20 e a cada 20 execuções

### Como reproduzir
1. Abrir `http://localhost:3000/consultor` (logado como consultor)
2. Abrir DevTools → Console
3. Observar qual log se repete e com que frequência

---

## 4. Culpado primário e mecanismo do loop

### Culpado primário
**`apps/web/src/components/ConsultorGuard.tsx`** — `useEffect` (linhas 16-50)

### Mecanismo do loop
**Fetch repetido** (não redirect repetido).

O `useEffect` do ConsultorGuard depende de `[authLoading, user, session?.access_token]`. O objeto `session` do Supabase pode ser recriado (nova referência) em eventos como `onAuthStateChange` ou refresh de token, fazendo `session?.access_token` ser reavaliado e o efeito rodar de novo. O `router` (removido das deps em fix anterior) também podia causar re-execuções por referência instável.

Cada execução do efeito dispara `fetchMe` → `GET /me` → API responde 200 → `setMe`/`setChecking` → re-render → possível nova execução do efeito (por mudança de referência nas deps) → novo `fetchMe` → **loop**.

### Evidência
- Network: dezenas/centenas de `GET /me` (200) em sequência
- Console (com instrumentação): `[ME_FETCH] start` e `[CONSULTOR_GUARD] effect run` repetindo com count crescente
- Página presa em "Carregando..." porque o componente não estabiliza

### Correção aplicada
1. **Cache por token**: `cacheRef` guarda `{ token, data }`; se o token for o mesmo, usa cache e não chama `fetchMe` novamente.
2. **Remoção de `router` das deps**: `router` do Next.js é estável, mas sua inclusão nas deps podia provocar re-runs desnecessários.

---

## 5. DoD — Critério de pronto

- [x] Lista de todos os redirects encontrados (seção 1)
- [x] Lista de todos os locais que chamam `/me` (seção 2)
- [x] Evidência do culpado (log + arquivo/linha) (seção 4)
- [x] Instrumentação temporária para reprodução (seção 3)

### Fix definitivo (Prompt 2)
O loop foi eliminado centralizando `/me` no AuthProvider:
- `me` e `meLoading` expostos via `useAuth()`
- Dedupe in-flight em `fetchMe` (api.ts)
- ConsultorGuard e ProtectedRoute usam `me` do contexto
- `/me` chamado no máximo 1 vez por sessão (exceto quando token muda)

### Fix RoleGate idempotente (Prompt 3)
Redirect por role centralizado em `RoleGate`:
- `RoleGate` lê `me.role` do AuthProvider, usa `usePathname()`
- `didRedirectRef` garante no máximo 1 redirect
- Condição: `target !== null` e `target !== pathname`
- CONSULTOR/ADMIN fora de /consultor|/full/consultor => /consultor
- USER em /consultor|/full/consultor => /diagnostico
- ConsultorGuard removido; ProtectedRoute só faz auth
