# DB_SSL_RELAXED - Configuração SSL para PostgreSQL

## Visão Geral

A flag `DB_SSL_RELAXED` permite configurar o modo SSL das conexões PostgreSQL para suportar TLS MITM (Man-In-The-Middle) local, útil para desenvolvimento e debugging com proxies locais ou certificados auto-assinados.

## O que é DB_SSL_RELAXED?

`DB_SSL_RELAXED` é uma variável de ambiente que controla a validação de certificados SSL nas conexões PostgreSQL:

- **STRICT (padrão)**: Valida certificados SSL (`rejectUnauthorized: true`)
- **RELAXED**: Aceita certificados auto-assinados (`rejectUnauthorized: false`)

## Quando usar

### ✅ Uso Aprovado

- **Apenas em ambiente local/desenvolvimento** (`NODE_ENV=development`)
- Quando você precisa usar um proxy MITM local (ex: Burp Suite, OWASP ZAP, mitmproxy)
- Para debugging de conexões SSL/TLS
- Quando trabalhando com certificados auto-assinados em ambientes de desenvolvimento

### ❌ NUNCA usar em produção

- **Bloqueado por guardrail**: Se `NODE_ENV=production` e `DB_SSL_RELAXED=true`, o boot falha imediatamente
- Risco de segurança: MITM attacks podem interceptar dados sensíveis

## Riscos e Mitigações

### Risco: Man-In-The-Middle (MITM)

Quando `DB_SSL_RELAXED=true`, a conexão PostgreSQL aceita certificados não verificados, permitindo que:
- Proxies locais interceptem o tráfego
- Certificados auto-assinados sejam aceitos sem validação
- Conexões sejam vulneráveis a ataques MITM

### Por que é temporário?

Esta configuração é **temporária** porque:
1. Deve ser usada apenas durante desenvolvimento/debugging
2. O guardrail impede uso acidental em produção
3. Não deve ser commitada no `.env` de produção

## Como configurar

### Desenvolvimento (RELAXED)

```bash
# .env
NODE_ENV=development
DB_SSL_RELAXED=true
DATABASE_URL=postgresql://user:pass@host:5432/db
```

**Valores aceitos para `DB_SSL_RELAXED`:**
- `"1"`, `"true"`, `"TRUE"`, `"yes"`, `"YES"` → RELAXED
- Qualquer outro valor ou ausente → STRICT (padrão)

### Produção (STRICT - obrigatório)

```bash
# .env (produção)
NODE_ENV=production
# DB_SSL_RELAXED não definido ou false
DATABASE_URL=postgresql://user:pass@host:5432/db
```

## Diagnóstico de Erros

### Erro: `SELF_SIGNED_CERT_IN_CHAIN`

**Sintoma:**
```
Error: self signed certificate in certificate chain
```

**Causa:**
- Certificado SSL do banco não é confiável (auto-assinado ou proxy MITM)
- `DB_SSL_RELAXED` não está habilitado ou está como `false`

**Solução (apenas desenvolvimento):**
1. Verifique se `NODE_ENV=development`
2. Configure `DB_SSL_RELAXED=true` no `.env`
3. Reinicie o servidor

**⚠️ NUNCA use em produção!**

### Erro: `DB_SSL_RELAXED=true não é permitido em produção`

**Sintoma:**
```
[DB] FATAL: DB_SSL_RELAXED=true não é permitido em produção (NODE_ENV=production).
Use SSL strict em produção para segurança.
```

**Causa:**
- Tentativa de usar SSL relaxado em produção (bloqueado por guardrail)

**Solução:**
- Remova `DB_SSL_RELAXED` do `.env` de produção OU
- Configure `DB_SSL_RELAXED=false` OU
- Use certificados SSL válidos e confiáveis

## Logs e Evidências

O sistema registra o modo SSL no boot:

```
[DB] SSL_MODE=RELAXED|STRICT
[DB] DATABASE_URL_HOST=<host> USER=<user> DB=<database>
```

### Cenários de Teste

#### Cenário A: Development + RELAXED
```bash
NODE_ENV=development
DB_SSL_RELAXED=true
```
**Esperado:**
- ✅ Log: `[DB] SSL_MODE=RELAXED`
- ✅ DB CHECK OK
- ✅ Conexão aceita certificados auto-assinados

#### Cenário B: Development + STRICT
```bash
NODE_ENV=development
DB_SSL_RELAXED=false  # ou não definido
```
**Esperado:**
- ✅ Log: `[DB] SSL_MODE=STRICT`
- ⚠️ DB CHECK pode falhar se certificado não for confiável
- ⚠️ Erro: `SELF_SIGNED_CERT_IN_CHAIN` (se usar proxy MITM)

#### Cenário C: Production + RELAXED (bloqueado)
```bash
NODE_ENV=production
DB_SSL_RELAXED=true
```
**Esperado:**
- ❌ Boot falha imediatamente
- ❌ Erro: `DB_SSL_RELAXED=true não é permitido em produção`
- ❌ `process.exit(1)`

## Implementação Técnica

### Arquivos relacionados

- `apps/api/src/db.js` - Helper principal para API
- `db/lib/dbSsl.js` - Helper compartilhado para scripts (seed, migrations)
- `apps/api/src/server.js` - DB CHECK no boot

### Funções principais

- `isDbSslRelaxed()` - Verifica se flag está habilitada
- `getDbSslMode()` - Retorna "RELAXED" ou "STRICT"
- `validateSslGuardrail()` - Valida produção + relaxed (fail-closed)
- `createPgPool()` - Cria Pool com SSL configurado

## Referências

- [PostgreSQL SSL Configuration](https://www.postgresql.org/docs/current/libpq-ssl.html)
- [Node.js pg SSL Options](https://node-postgres.com/features/ssl)
