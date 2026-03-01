# Subscription Schema — Fase 6

Migration: `db/migrations/038_subscriptions.sql`

---

## Visão geral

A tabela `subscriptions` é a fonte de verdade financeira de uma empresa.
**Ela não substitui `entitlements`** (que continua sendo o gate de acesso durante
a transição para o gateway de pagamento). Quando a integração de gateway estiver
completa, um webhook atualizará `subscriptions` e um job/trigger espelhará
o resultado para `entitlements`.

Regra: **uma empresa → uma assinatura** (`UNIQUE company_id`).

---

## Campos

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `id` | UUID | sim | PK gerada automaticamente |
| `company_id` | UUID FK | sim | Empresa dona da assinatura |
| `plan` | TEXT | sim | Plano contratado (ver abaixo) |
| `status` | TEXT | sim | Estado atual (ver abaixo) |
| `trial_ends_at` | TIMESTAMPTZ | não | Fim do período de trial |
| `current_period_start` | TIMESTAMPTZ | não | Início do período de faturamento atual |
| `current_period_end` | TIMESTAMPTZ | não | Fim do período de faturamento atual |
| `grace_period_ends_at` | TIMESTAMPTZ | não | Prazo máximo em carência antes de suspender |
| `gateway_subscription_id` | VARCHAR(255) | não | ID da assinatura no gateway (ex: Stripe `sub_…`) |
| `gateway_customer_id` | VARCHAR(255) | não | ID do cliente no gateway (ex: Stripe `cus_…`) |
| `cancelled_at` | TIMESTAMPTZ | não | Momento do cancelamento |
| `created_at` | TIMESTAMPTZ | sim | Criação do registro |
| `updated_at` | TIMESTAMPTZ | sim | Última atualização (trigger automático) |

---

## Planos (`plan`)

| Valor | Descrição |
|---|---|
| `FREE` | Acesso gratuito limitado; padrão para novas empresas em trial |
| `PRO` | Plano pago individual — acesso FULL + relatórios |
| `CONSULTORIA` | Plano com consultoria ativa — inclui acesso do consultor vinculado |

> **Preços nunca ficam no banco.** Lidos de variáveis de ambiente pela API
> (`PRICE_PRO_BRL`, `PRICE_CONSULTORIA_BRL`).

---

## Estados (`status`)

| Valor | Descrição |
|---|---|
| `TRIAL` | Período de avaliação gratuita ativo |
| `ACTIVE` | Assinatura paga e vigente |
| `PAST_DUE` | Pagamento falhou; em carência (`grace_period_ends_at` define o prazo) |
| `INACTIVE` | Acesso suspenso (carência expirada ou desativação manual) |
| `CANCELLED` | Cancelada pelo usuário ou pelo sistema; `cancelled_at` preenchido |

---

## Transições de estado

```
                   ┌────────┐
          novo ───▶│ TRIAL  │──── trial_ends_at expira sem pagamento ──▶ INACTIVE
                   └───┬────┘
                       │ pagamento confirmado (webhook)
                       ▼
                   ┌────────┐
                   │ ACTIVE │◀──── renovação bem-sucedida (webhook)
                   └───┬────┘
                       │ cobrança falha
                       ▼
                   ┌──────────┐
                   │ PAST_DUE │──── grace_period_ends_at expira ──▶ INACTIVE
                   └───┬──────┘
                       │ pagamento recuperado (webhook)
                       ▼
                   ┌────────┐
                   │ ACTIVE │
                   └────────┘

  ACTIVE / PAST_DUE / TRIAL ──── cancelamento (usuário ou gateway) ──▶ CANCELLED
```

### Regras de transição

- `TRIAL → ACTIVE`: webhook de pagamento confirmado durante o trial.
- `TRIAL → INACTIVE`: `trial_ends_at < NOW()` e nenhum pagamento registrado.
- `ACTIVE → PAST_DUE`: webhook de falha de cobrança; `grace_period_ends_at` é definido.
- `PAST_DUE → ACTIVE`: webhook de pagamento recuperado.
- `PAST_DUE → INACTIVE`: `grace_period_ends_at < NOW()`.
- `* → CANCELLED`: usuário cancela ou gateway reporta cancelamento; `cancelled_at` é preenchido.
- **`SUBMITTED/CLOSED` nunca retrocedem** — versões históricas são imutáveis.

---

## RLS (Row Level Security)

- **SELECT**: permitido apenas quando `company_id IN (SELECT id FROM companies WHERE owner_user_id = auth.uid())` — o dono da empresa lê sua própria assinatura.
- **INSERT / UPDATE**: sem policy para usuário final. Escritas são feitas exclusivamente pela API com `service_role` (webhook do gateway).

---

## Relação com `entitlements`

Durante a transição:

```
subscriptions  ──(webhook)──▶  API (service_role)  ──▶  entitlements
    (fonte de verdade $)                                  (gate de acesso)
```

- `entitlements.plan = 'FULL'` quando `subscriptions.status IN ('ACTIVE', 'TRIAL') AND subscriptions.plan IN ('PRO', 'CONSULTORIA')`.
- `entitlements.plan = 'LIGHT'` nos demais casos.
- Essa lógica **fica no código da API**, não em triggers do banco.

---

## Índices

| Nome | Colunas | Motivo |
|---|---|---|
| `idx_subscriptions_company_id` | `company_id` | Look-up principal |
| `idx_subscriptions_status` | `status` | Varredura de jobs de expiração |
| `idx_subscriptions_gateway_subscription_id` | `gateway_subscription_id` | Roteamento de webhooks (partial, só NOT NULL) |
