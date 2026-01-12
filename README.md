# FCA App - Management Maturity Diagnostic System

Sistema de diagnóstico de maturidade gerencial para pequenas empresas, desenvolvido com Next.js 14 (App Router) e Supabase.

## 📋 Visão Geral

O FCA App é uma aplicação web que permite avaliar a maturidade gerencial de empresas através de um processo estruturado de diagnóstico, recomendação de ações e acompanhamento de implementação.

### Fluxo Principal

1. **Autenticação** - Login/registro via Supabase Auth
2. **Cadastro de Empresa** - Informações básicas da empresa
3. **Diagnóstico** - Questionário de avaliação de maturidade
4. **Resultados** - Visualização de scores e seleção de ações (blocos de até 3)
5. **Dashboard** - Acompanhamento de ações com status e evidências

## 🏗️ Arquitetura

### Stack Tecnológico

- **Frontend:** Next.js 14.x (App Router), React 18, TypeScript
- **Backend API (Next.js):** API Routes para proxy/validação
- **Backend Express:** Express.js standalone para lógica de negócio (porta 3001)
- **Database/Auth:** Supabase (PostgreSQL + Auth)
- **Styling:** CSS Modules / Vanilla CSS
- **Deployment:** Vercel (recomendado para frontend)

### Arquitetura Backend

O sistema utiliza uma **arquitetura híbrida de backend**:

#### Next.js API Routes (Frontend Proxy)
- Porta: 3000 (padrão Next.js)
- Função: Validação de ambiente, proxy para Express backend
- Localização: `src/app/api/*`
- **Regra crítica:** Todas as rotas validam `BACKEND_BASE_URL` obrigatoriamente
- Retorna HTTP 500 se `BACKEND_BASE_URL` não estiver definida

#### Express Backend (Business Logic)
- Porta: 3001 (configurável via `PORT`)
- Função: Lógica de negócio, validações, persistência
- Localização: `src/adapters/http/*`
- Arquitetura: Hexagonal (Ports & Adapters)
- Middlewares: Helmet, CORS, Request ID, Logger, Error Handler
- **Endpoints implementados:**
  - `GET /health` - Health check
  - `POST /api/companies` - Criar empresa
  - `GET /api/cycles/active` - Obter ciclo ativo

**Variável de ambiente obrigatória:**
```env
BACKEND_BASE_URL=http://localhost:3001
```

### Estrutura de Diretórios

```
fca-app/
├── src/
│   ├── app/                    # App Router pages & API Routes
│   │   ├── api/               # Next.js API Routes (proxy)
│   │   ├── login/             # Autenticação
│   │   ├── company/           # Cadastro de empresa
│   │   ├── diagnostic/        # Questionário
│   │   ├── results/           # Resultados + Seleção de ações
│   │   └── dashboard/         # Acompanhamento
│   ├── adapters/              # Express Backend (Hexagonal)
│   │   └── http/              # Camada HTTP
│   │       ├── routes/        # Rotas Express
│   │       ├── middlewares/   # Middlewares
│   │       ├── dtos/          # DTOs e validação (Zod)
│   │       └── server.ts      # Express app
│   ├── application/           # Casos de uso e serviços
│   ├── domain/                # Entidades e lógica de domínio
│   ├── components/            # Componentes React
│   │   ├── AuthGuard.tsx     # Guard de autenticação
│   │   ├── CompanyGuard.tsx  # Guard de empresa
│   │   ├── CycleGuard.tsx    # Guard de ciclo
│   │   └── ResultsGuard.tsx  # Guard de resultados
│   ├── contexts/              # React Contexts
│   │   ├── AuthContext.tsx   # Contexto de autenticação
│   │   └── CycleContext.tsx  # Contexto de ciclo
│   └── lib/                   # Utilitários
│       └── supabase-client.ts # Cliente Supabase
└── .env.local                 # Variáveis de ambiente
```

## 🔒 Sistema de Guards

A aplicação utiliza uma hierarquia de guards aplicados no layout raiz para garantir o fluxo correto:

```
AuthGuard (valida sessão, fornece accessToken)
  └─ CompanyGuard (valida empresa cadastrada)
      └─ CycleGuard (valida ciclo ativo, route-aware)
          └─ ResultsGuard (valida diagnóstico completo)
```

### Guards Implementados

#### AuthGuard
- Valida sessão Supabase
- Fornece `accessToken` via `AuthContext`
- Redireciona para `/login` se não autenticado
- Redireciona para `/company` após login bem-sucedido

#### CompanyGuard
- Valida existência de empresa via `GET /api/companies/me`
- Redireciona para `/company` se empresa não cadastrada
- Redireciona para `/diagnostic` se já tem empresa e tenta acessar `/company`

#### CycleGuard (Route-Aware)
- Valida ciclo ativo via `GET /api/cycles/active`
- **Com ciclo ativo:** Permite acesso normal, `cycleId` disponível via `CycleContext`
- **Sem ciclo ativo:**
  - Se rota = `/dashboard`: Permite acesso com `cycleId = null`
  - Outras rotas: Redireciona para `/dashboard`

#### ResultsGuard
- Valida status do diagnóstico via `GET /api/results/status`
- Permite acesso a `/results` apenas se `diagnostic_status === 'completed'`
- Redireciona para `/diagnostic` em todos os outros casos

## 📦 Contextos

### AuthContext
Fornece o token de autenticação para toda a aplicação.

```typescript
const { accessToken } = useAuth();
```

### CycleContext
Fornece o ID do ciclo ativo ou `null` se não houver ciclo.

```typescript
const { cycleId } = useCycle();
```

## 🚀 Configuração e Execução

### Pré-requisitos

- Node.js 18+
- npm ou yarn
- Conta Supabase configurada
- `lsof` (para scripts de QA/Teardown)

### Variáveis de Ambiente

Crie um arquivo `.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Backend Express
BACKEND_BASE_URL=http://localhost:3001
PORT=3001

# CORS
FRONTEND_ORIGINS=http://localhost:3000,http://localhost:3003
```

**Variáveis obrigatórias:**
- `BACKEND_BASE_URL`: URL do Express backend (Next.js API Routes validam essa variável)
- `PORT`: Porta do Express backend (padrão: 3001)
- `FRONTEND_ORIGINS`: Origens permitidas para CORS no Express

### Instalação

```bash
# Instalar dependências
npm install

# Executar frontend (Next.js)
npm run dev

# Executar backend (Express) - terminal separado
npm run dev:backend

# Build de produção
npm run build

# Executar produção
npm start

# Executar Modo QA (Testes Automatizados)
npm run qa:bootstrap-backend  # Inicia backend na porta 3001 (background)
npm run qa:api                # Executa testes de contrato API
npm run qa:teardown-backend   # Para o backend QA
```

**Portas:**
- Frontend (Next.js): `http://localhost:3000`
- Backend (Express): `http://localhost:3001`

### Modo QA

O backend suporta um modo especial de QA para testes automatizados.

**Ativação:**
```env
QA_MODE=true
```

**Funcionalidades QA:**
- Endpoint `POST /api/__qa/token` para gerar tokens de teste
- Scripts de lifecycle (`qa:bootstrap`, `qa:teardown`)
- Scripts de dados (`qa:reset`, `qa:seed`)
- **Nota:** O Modo QA é automaticamente desabilitado se `NODE_ENV=production`.

## 🔐 Princípios de Segurança

### Backend Soberano
- **Frontend executa, não decide:**  Todas as validações de negócio são feitas no backend
- **Guards centralizado s:** Validações de fluxo aplicadas no layout raiz
- **Sem lógica em páginas:** Páginas apenas consomem dados e renderizam

### Autenticação e Autorização
- JWT via Supabase Auth (RS256)
- Token fornecido via `AuthContext`
- Todas as chamadas API incluem `Authorization: Bearer <token>`
- Páginas **não** chamam `supabase.auth.getSession()` diretamente

### Multi-tenancy
- Separação estrita por `company_id`
- RLS (Row Level Security) no Supabase
- Validação de empresa em cada requisição

## 📱 Páginas e Rotas

### `/login`
- Autenticação via Supabase
- Redirect para `/company` após login

### `/company`
- Cadastro de informações da empresa
- Acessível apenas se autenticado e sem empresa cadastrada
- Redirect para `/diagnostic` se empresa já existe

### `/diagnostic`
- Questionário de avaliação de maturidade
- Acessível apenas com ciclo ativo
- Questões booleanas (Sim/Não)
- Navegação com Next/Previous
- Submit final marca diagnóstico como completo

### `/results`
- Visualização de scores do diagnóstico
- Seleção de ações em blocos de até 3
- Último bloco pode conter 1 ou 2 ações
- **Não suporta refresh** (estado em memória)
- Redirect para `/dashboard` após última seleção

### `/dashboard`
- Acompanhamento de ações selecionadas
- Alteração de status: `not_started`, `in_progress`, `completed`
- Registro de evidências (texto simples, não editável)
- Encerramento de ciclo (validado pelo backend)
- **Suporta refresh** (estado do backend)
- **Modo sem ciclo:** Exibe empty state

## 🔄 Fluxo de Dados

### Diagnostic Flow
```
AuthGuard → CompanyGuard → CycleGuard → /diagnostic
  └─ POST /api/diagnostic/submit
      └─ diagnostic_status = 'completed'
          └─ ResultsGuard permite /results
```

### Results Flow
```
/results
  └─ GET /api/results (scores)
  └─ GET /api/actions/suggestions (ações disponíveis)
  └─ Seleção de até 3 ações por bloco
  └─ POST /api/actions/select
  └─ Após último bloco → /dashboard
```

### Dashboard Flow
```
/dashboard
  └─ GET /api/dashboard?cycle_id=<uuid>
      └─ actions[], cycle_status
  └─ POST /api/dashboard/status (alterar status)
  └─ POST /api/dashboard/evidence (adicionar evidência)
  └─ POST /api/dashboard/cycles/close
      └─ Backend valida: todas ações completed
      └─ cycle_status = 'closed'
      └─ Dashboard → read-only
```

## 🧪 Contrato de Rotas

### Rotas Válidas (Lista Fechada)
```
/login
/company
/diagnostic
/results
/dashboard
```

**Nenhuma outra rota** pode ser criada ou referenciada sem violar o contrato.

### Redirects por Guard

| Guard | Condição | Redirect |
|-------|----------|----------|
| AuthGuard | Sem sessão | `/login` |
| AuthGuard | Login bem-sucedido | `/company` |
| CompanyGuard | Sem empresa | `/company` |
| CompanyGuard | Empresa existe + em `/company` | `/diagnostic` |
| CycleGuard | Sem ciclo + não `/dashboard` | `/dashboard` |
| ResultsGuard | Status ≠ completed | `/diagnostic` |

## 📊 Endpoints Backend

### Arquitetura de Endpoints

O sistema possui **dois tipos de endpoints**:

1. **Next.js API Routes** (`/api/*` em Next.js)
   - Função: Proxy e validação de ambiente
   - Valida `BACKEND_BASE_URL` obrigatoriamente
   - Retorna HTTP 500 se variável não configurada

2. **Express Backend** (porta 3001)
   - Função: Lógica de negócio, validações, persistência
   - Todos os endpoints retornam JSON
   - Nunca retorna HTML (exceto erro 404 padrão do Express)

### Express Backend - Endpoints Implementados

#### Health Check
```
GET http://localhost:3001/health
Response: 200 OK
{
  "ok": true
}
```

#### Empresa
```
POST http://localhost:3001/api/companies
Request Body:
{
  "name": "string (required)",
  "segment": "string (required)"
}

Success Response: 201 Created
{
  "id": "uuid",
  "name": "string",
  "segment": "string"
}

Validation Error: 400 Bad Request
{
  "error": "ValidationError",
  "message": "Invalid input: expected string, received undefined"
}
```

#### Ciclo
```
GET http://localhost:3001/api/cycles/active
No body required

No Active Cycle: 404 Not Found
{
  "active": false
}

Active Cycle Exists: 200 OK
{
  // Estrutura do ciclo ativo (a ser definida)
}
```

### Next.js API Routes (Frontend)

#### Empresa
- `GET /api/companies/me` - Obter empresa do usuário (proxy para backend)
- `POST /api/companies` - Criar empresa (proxy para backend)

### Autenticação
- Gerenciado pelo Supabase Auth
- Token obtido no `AuthGuard`
- Incluído em todas as requisições via header `Authorization: Bearer <token>`

### Diagnóstico (A Implementar)
- `GET /api/diagnostic?cycle_id=<uuid>` - Obter questões
- `POST /api/diagnostic/submit` - Submeter respostas

### Resultados (A Implementar)
- `GET /api/results/status?cycle_id=<uuid>` - Status do diagnóstico
- `GET /api/results?cycle_id=<uuid>` - Scores
- `GET /api/actions/suggestions?cycle_id=<uuid>` - Ações sugeridas
- `POST /api/actions/select` - Selecionar ações

### Dashboard (A Implementar)
- `GET /api/dashboard?cycle_id=<uuid>` - Ações do ciclo
- `POST /api/dashboard/status` - Atualizar status de ação
- `POST /api/dashboard/evidence` - Adicionar evidência
- `POST /api/dashboard/cycles/close` - Encerrar ciclo

## 🎯 Regras de Negócio

### Seleção de Ações
- Ações apresentadas em blocos de até 3
- Usuário **deve** selecionar exatamente 3 por bloco (exceto último bloco)
- Último bloco pode conter 1 ou 2 ações
- Sem skip, sem retorno a blocos anteriores

### Status de Ações
- `not_started` - Não iniciada
- `in_progress` - Em andamento
- `completed` - Concluída
- Transições manuais, sem automação

### Evidências
- Formato: Texto simples
- Uma evidência por ação
- Não editável após envio
- Não obrigatória no MVP

### Encerramento de Ciclo
- Requer: **Todas** as ações com status `completed`
- Validação: Backend (não frontend)
- Após encerramento: Dashboard em modo read-only
- `cycle_status = 'closed'` persiste no banco

## 🐛 Troubleshooting

### Build Errors

```bash
# Limpar cache
rm -rf .next node_modules
npm install
npm run build
```

### Backend Express não inicia

1. Verificar se porta 3001 está livre:
```bash
lsof -i :3001
# Se houver processo, matar: kill -9 <PID>
```

2. Verificar variável `PORT` em `.env.local`
3. Verificar logs do backend para erros de TypeScript
4. Executar: `npm run dev:backend`

### Erro "BACKEND_BASE_URL missing" no frontend

1. Verificar `.env.local` contém:
```env
BACKEND_BASE_URL=http://localhost:3001
```
2. Reiniciar Next.js dev server
3. Verificar que backend Express está rodando em 3001

### Supabase Connection Issues

1. Verificar variáveis de ambiente
2. Confirmar URL e keys no dashboard Supabase
3. Verificar RLS policies

### Guard Redirects Inesperados

1. Verificar ordem dos guards no `layout.tsx`
2. Confirmar dados no backend (`/api/companies/me`, `/api/cycles/active`)
3. Checar console do navegador para erros
4. Verificar que backend Express está respondendo corretamente

## 📚 Documentação Adicional

Consulte a pasta `.gemini/antigravity/brain/` para documentação detalhada:

- `project_documentation.md` - Documentação completa do projeto
- `prompt_04_fe_*_evidence.md` - Evidências de implementação por fase
- `quick_start_guide.md` - Guia rápido de setup

## 🤝 Contribuindo

Este projeto segue princípios estritos de:
- **Backend Soberano** - Frontend não decide regras de negócio
- **Guards Centralizados** - Validações no layout raiz
- **Contratos Fechados** - Rotas e endpoints pré-definidos
- **Zero Ambiguidade** - Comportamento determinístico

Qualquer PR deve aderir a esses princípios.

## 📝 Licença

[Definir licença apropriada]

## 👥 Autores

[Definir autores/equipe]
