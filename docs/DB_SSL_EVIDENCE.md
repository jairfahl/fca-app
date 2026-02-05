# DB_SSL_RELAXED - Evidências de Comportamento

---

Ultima atualizacao: 2026-02-04.
Este documento registra evidências dos 3 cenários principais do guardrail `DB_SSL_RELAXED`.

## Como gerar evidências

Execute o script de teste:
```bash
./scripts/test-db-ssl-evidence.sh
```

Ou teste manualmente cada cenário:

### Cenário A: Development + RELAXED

```bash
# .env
NODE_ENV=development
DB_SSL_RELAXED=true
DATABASE_URL=<sua-url>
```

**Comando:**
```bash
cd apps/api && node src/server.js
```

**Evidência esperada:**
```
[DB] SSL_MODE=RELAXED
[DB] DATABASE_URL_HOST=<host> USER=<user> DB=<database>
DB CHECK OK
```

**Screenshot/Log:**
```
[Capture aqui o output completo]
```

---

### Cenário B: Development + STRICT

```bash
# .env
NODE_ENV=development
DB_SSL_RELAXED=false  # ou não definido
DATABASE_URL=<sua-url>
```

**Comando:**
```bash
cd apps/api && node src/server.js
```

**Evidência esperada:**
```
[DB] SSL_MODE=STRICT
[DB] DATABASE_URL_HOST=<host> USER=<user> DB=<database>
```

**Comportamento:**
- Se certificado for válido: `DB CHECK OK`
- Se certificado for auto-assinado/proxy MITM: `DB CHECK FAIL` com erro `SELF_SIGNED_CERT_IN_CHAIN`

**Screenshot/Log:**
```
[Capture aqui o output completo]
```

---

### Cenário C: Production + RELAXED (fail-closed)

```bash
# .env
NODE_ENV=production
DB_SSL_RELAXED=true
DATABASE_URL=<sua-url>
```

**Comando:**
```bash
cd apps/api && node src/server.js
```

**Evidência esperada:**
```
[DB] FATAL: DB_SSL_RELAXED=true não é permitido em produção (NODE_ENV=production). Use SSL strict em produção para segurança.
DB CHECK FAIL
[DBCHECK] FAIL: {
  message: '[DB] FATAL: DB_SSL_RELAXED=true não é permitido em produção...',
  ...
}
```

**Comportamento:**
- Boot falha imediatamente (antes de conectar ao banco)
- `process.exit(1)` é chamado
- Servidor não inicia

**Screenshot/Log:**
```
[Capture aqui o output completo]
```

---

## Checklist de Evidências

- [ ] Cenário A: Log mostra `SSL_MODE=RELAXED` e `DB CHECK OK`
- [ ] Cenário B: Log mostra `SSL_MODE=STRICT` (pode falhar se certificado inválido)
- [ ] Cenário C: Boot falha com mensagem explícita de guardrail
- [ ] Screenshots/logs anexados ao Evidence Pack
- [ ] Documentação `docs/DB_SSL.md` atualizada

## Data de Geração

- **Data:** [Preencher]
- **Ambiente:** [Preencher: local/CI]
- **Versão:** [Preencher: git commit hash]
