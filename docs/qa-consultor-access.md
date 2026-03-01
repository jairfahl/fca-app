# QA: Acesso à área do consultor — Checklist e evidência

## Objetivo
Provar que as correções de loop/redirect funcionam e reduzir regressão.

---

## Checklist de casos

### Caso A: consultor@fca.com abre /consultor => ok
| Passo | Ação | Resultado esperado | PASS |
|-------|------|-------------------|------|
| A1 | Login como `consultor@fca.com` | Redireciona para `/consultor` | ☐ |
| A2 | Abrir `http://localhost:3000/consultor` | Página carrega sem loop | ☐ |
| A3 | Network: filtrar por `me` | Exatamente **1** request `GET /me` (200) | ☐ |
| A4 | Console | Sem spam de `[ME_FETCH]` ou `[ROLE_REDIRECT]` (no máx. 1 de cada) | ☐ |
| A5 | Conteúdo | Lista de usuários/empresas OU "Nenhum usuário encontrado" | ☐ |

### Caso B: user@ abre /consultor => redirect 1x
| Passo | Ação | Resultado esperado | PASS |
|-------|------|-------------------|------|
| B1 | Login como usuário comum (não consultor) | Redireciona para `/onboarding` ou `/diagnostico` | ☐ |
| B2 | Navegar manualmente para `http://localhost:3000/consultor` | **1** redirect para `/diagnostico` | ☐ |
| B3 | Network | Sem loop de requests | ☐ |
| B4 | Console | `[ROLE_REDIRECT]` aparece no máx. 1 vez | ☐ |

### Caso C: consultor acessa /diagnostico => redirect 1x para /consultor
| Passo | Ação | Resultado esperado | PASS |
|-------|------|-------------------|------|
| C1 | Como consultor, abrir `http://localhost:3000/diagnostico` | **1** redirect para `/consultor?msg=Acesso%20negado...` | ☐ |
| C2 | Mensagem | "Acesso negado. Use o painel do consultor." | ☐ |
| C3 | Network | Sem loop | ☐ |

### Caso D: /consultor?msg=... => exibe msg sem loop
| Passo | Ação | Resultado esperado | PASS |
|-------|------|-------------------|------|
| D1 | Como consultor, abrir `http://localhost:3000/consultor?msg=Acesso%20de%20consultor%20é%20pelo%20painel.` | Mensagem exibida em banner azul | ☐ |
| D2 | Aguardar 3s | URL limpa para `/consultor` (sem `?msg=`) | ☐ |
| D3 | Network | Sem loop de redirects ou fetches | ☐ |
| D4 | Console | Sem spam de logs | ☐ |

---

## Evidência a capturar

### 1. Network — /me 1x
- Abrir DevTools → Network
- Filtrar por `me` ou `Fetch/XHR`
- Recarregar `/consultor` como consultor
- **Esperado:** 1 linha `me` com status 200

### 2. Console — sem spam
- Abrir DevTools → Console
- Limpar console
- Recarregar `/consultor` como consultor
- **Esperado:** no máx. 1x `[ME_FETCH] count=1 role=CONSULTOR` (se instrumentação ativa)

### 3. Screenshots sugeridos (para PR)
Salvar em `docs/evidence/` ou anexar ao PR:
- `evidence-consultor-network.png` — Network com 1x /me
- `evidence-consultor-console.png` — Console sem spam
- `evidence-consultor-page.png` — Página renderizada com lista ou "Nenhum usuário"

---

## Critério PASS manual

**PASS** se:
- Caso A: todos os passos A1–A5 ok
- Caso B: todos os passos B1–B4 ok
- Caso C: todos os passos C1–C3 ok
- Caso D: todos os passos D1–D4 ok
- Nenhum request em loop no Network
- Página não fica em "Carregando..." indefinidamente

---

## Teste unitário (mínimo)

Rodar: `npm run test:role-gate` ou `node scripts/test-role-gate-logic.mjs`

Garante que `computeRedirectTarget`:
- CONSULTOR em `/consultor` => `null` (não redireciona)
- ADMIN em `/consultor` => `null`
- USER em `/consultor` => `/diagnostico`
- CONSULTOR em `/full` => `/consultor`
