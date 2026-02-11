# Gate D1 - Status da Migração

## Migração Criada

✅ **Arquivo criado:** `db/migrations/009_d1_leads_triage.sql`

**Nota:** Migrações 010–013 foram adicionadas posteriormente (light_action_plans, fallbacks, evidências).

## Erro de Conectividade

A migração não pôde ser aplicada devido a erro de conectividade:

```
Error: getaddrinfo ENOTFOUND db.rruacqykgwlafqwjtgfq.supabase.co
```

### Possíveis Causas

1. **Projeto Supabase pausado**: Projetos gratuitos do Supabase podem ser pausados após inatividade
2. **Problema temporário de rede/DNS**: Problema de conectividade temporário
3. **Hostname incorreto**: Verificar se o `DATABASE_URL` no `.env` está correto

### Soluções

#### 1. Verificar Status do Projeto Supabase

1. Acesse o [Dashboard do Supabase](https://app.supabase.com)
2. Verifique se o projeto `rruacqykgwlafqwjtgfq` está ativo
3. Se estiver pausado, clique em "Restore" para reativar

#### 2. Verificar DATABASE_URL

Confirme que o `DATABASE_URL` no `.env` está correto:

```bash
# Formato esperado:
DATABASE_URL=postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres
```

#### 3. Testar Conectividade

```bash
# Testar resolução DNS
nslookup db.rruacqykgwlafqwjtgfq.supabase.co

# Testar conectividade
ping db.rruacqykgwlafqwjtgfq.supabase.co

# Testar conexão PostgreSQL (se psql estiver instalado)
psql $DATABASE_URL -c "SELECT version();"
```

#### 4. Aplicar Migração Quando Conectividade Estiver OK

Quando a conectividade for restaurada:

```bash
cd ~/Downloads/fca-mtr
npm run db:migrate
```

## Validação da Migração

Após aplicar a migração, execute:

```sql
-- Verificar se a tabela foi criada
SELECT * FROM public.leads_triage;

-- Verificar estrutura
\d public.leads_triage

-- Verificar constraints
SELECT 
  constraint_name,
  constraint_type
FROM information_schema.table_constraints
WHERE table_schema = 'public' 
  AND table_name = 'leads_triage';

-- Verificar índices
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
  AND tablename = 'leads_triage';

-- Verificar RLS
SELECT 
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public' 
  AND tablename = 'leads_triage';

-- Verificar policies
SELECT 
  policyname,
  cmd
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename = 'leads_triage';
```

Ou execute o script de validação completo:

```bash
psql $DATABASE_URL -f db/validate/validate_d1_leads_triage.sql
```

## Estrutura Esperada

Após aplicar a migração, a tabela deve ter:

- **Colunas:**
  - `id` UUID PRIMARY KEY
  - `owner_user_id` UUID NOT NULL
  - `company_id` UUID NOT NULL
  - `assessment_id` UUID NOT NULL
  - `pain` TEXT NOT NULL (CHECK: CAIXA, VENDA, OPERACAO, PESSOAS)
  - `horizon` TEXT NOT NULL (CHECK: 30, 60, 90)
  - `budget_monthly` TEXT NOT NULL (CHECK: ZERO, ATE_300, DE_301_800, DE_801_2000, ACIMA_2000)
  - `created_at` TIMESTAMPTZ DEFAULT NOW()

- **Constraints:**
  - PRIMARY KEY: `id`
  - UNIQUE: `(owner_user_id, assessment_id)`
  - CHECK: `pain`, `horizon`, `budget_monthly`

- **Índices:**
  - `ix_leads_triage_company_id`
  - `ix_leads_triage_assessment_id`
  - `ix_leads_triage_owner_user_id`

- **RLS:**
  - Habilitado
  - Policy SELECT: `owner_user_id = auth.uid()`
  - Policy INSERT: `owner_user_id = auth.uid()`

## Próximos Passos

1. ✅ Migração criada e pronta
2. ⏳ Aguardar conectividade com banco
3. ⏳ Aplicar migração: `npm run db:migrate`
4. ⏳ Validar estrutura: `SELECT * FROM public.leads_triage;`

## Notas

- A migração está correta e será aplicada automaticamente quando a conexão for restaurada
- Não é necessário modificar a migração
- O erro é de infraestrutura/rede, não do código SQL
