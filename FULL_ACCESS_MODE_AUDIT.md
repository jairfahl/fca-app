# Passo 5 — FULL Access Mode (Evidence Pack)

---

Ultima atualizacao: 2026-02-04.
## 1) Modo teste ON

```bash
NODE_ENV=development
FULL_ACCESS_MODE=BYPASS_DEV
```

**Esperado:**
- `curl -i /full/...` retorna 200
- Tela FULL abre sem modal de paywall

```bash
BASE=http://localhost:3001
JWT=...
COMPANY_ID=...
ASSESSMENT_ID=...

curl -i "$BASE/full/diagnostic?company_id=$COMPANY_ID" \
  -H "Authorization: Bearer $JWT"
```

## 2) Modo paywall ON

```bash
NODE_ENV=development
FULL_ACCESS_MODE=ENFORCED
```

**Esperado:**
- Sem entitlement: 403
- Front mostra modal “Conteúdo Exclusivo”

```bash
curl -i "$BASE/full/diagnostic?company_id=$COMPANY_ID" \
  -H "Authorization: Bearer $JWT"
```

## 3) Fail-closed (produção)

```bash
NODE_ENV=production
FULL_ACCESS_MODE=BYPASS_DEV
```

**Esperado:**
- Backend falha no boot com erro explícito:
  `[FULL] FATAL: BYPASS_DEV proibido em produção`

## Prints

- [ ] Console backend com `FULL_ACCESS_MODE=BYPASS_DEV` em dev
- [ ] Tela FULL abrindo sem modal (BYPASS_DEV)
- [ ] Modal “Conteúdo Exclusivo” em ENFORCED
- [ ] Erro de boot em produção (fail-closed)
