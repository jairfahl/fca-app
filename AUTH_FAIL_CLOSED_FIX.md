# Incidente — Conexão PostgreSQL / Supabase (TLS)

---

Ultima atualizacao: 2026-02-04.
## Causa raiz
Ambiente corporativo intercepta conexões TLS (MITM), injetando certificado self-signed.
Isso quebra conexões PostgreSQL com Supabase via pooler.

## Sintomas observados
- SELF_SIGNED_CERT_IN_CHAIN
- password authentication failed (intermitente)
- ENOTFOUND (dependente de DNS corporativo)

## Decisão técnica
- DB_SSL_RELAXED=true permitido **apenas em desenvolvimento local**
- Produção: fail-closed obrigatório (boot aborta se relaxed)

## Evidência
Log no boot:
[DB] SSL_MODE=RELAXED | STRICT

## Nota operacional
Em caso de instabilidade TLS:
- Testar fora da rede corporativa (hotspot)
- Não resetar senha nem alterar usuário
