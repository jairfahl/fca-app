# FULL Root Cause Engine — Regras MVP (3 gaps)

**Objetivo:** Documentar perguntas, lógica de classificação e ações sugeridas para os 3 gaps prioritários do MVP.

**Fonte canônica:** `catalogs/full/cause_engine.v1.json`. Tabelas consolidadas em `docs/QUESTIONS_CATALOG.md`.

**Coerência (Prompt 7):** Recomendações só aparecem quando há match de catálogo + evidência nas respostas. Fallbacks são marcados `is_gap_content: true` e não exibidos para USER; consultor vê com badge "Conteúdo em definição". Cada recomendação inclui `evidence_keys` (respostas que sustentam).

---

## 1. Gaps do MVP

| Gap ID | Processo | Título | Descrição |
|--------|----------|-------|-----------|
| GAP_CAIXA_PREVISAO | ADM_FIN | Caixa imprevisível | Você não consegue prever o caixa com antecedência. |
| GAP_VENDAS_FUNIL | COMERCIAL | Vendas sem previsibilidade | Você não sabe o que vai vender nas próximas semanas. |
| GAP_ROTINA_GERENCIAL | GESTAO | Sem rotina gerencial (empresa no improviso) | A empresa corre atrás do urgente e não sustenta o básico. |

---

## 2. Perguntas por gap

### 2.1 Caixa / contas a receber (GAP_CAIXA_PREVISAO)

| q_id | Pergunta | Tipo |
|------|----------|------|
| CAIXA_Q1 | Existe uma rotina semanal para olhar o caixa dos próximos 30 dias? | LIKERT_5 |
| CAIXA_Q2 | As entradas e saídas futuras são registradas (mesmo que em planilha)? | LIKERT_5 |
| CAIXA_Q3 | Existe um responsável claro por atualizar e cobrar esse controle? | LIKERT_5 |
| CAIXA_Q4 | Você confia nos números (banco/contas a receber/contas a pagar) sem ajustes manuais frequentes? | LIKERT_5 |

**Opções LIKERT_5:** Discordo plenamente | Discordo | Neutro | Concordo | Concordo plenamente

### 2.2 Vendas / pipeline (GAP_VENDAS_FUNIL)

| q_id | Pergunta | Tipo |
|------|----------|------|
| VENDAS_Q1 | Existe uma reunião semanal comercial com pauta fixa? | LIKERT_5 |
| VENDAS_Q2 | Existe registro mínimo do funil (CRM ou planilha) atualizado? | LIKERT_5 |
| VENDAS_Q3 | Existe um responsável claro pelo resultado comercial e pela cobrança? | LIKERT_5 |
| VENDAS_Q4 | A regra de comissão/bonificação reforça o comportamento certo (prospecção, follow-up, conversão)? | LIKERT_5 |

### 2.3 Rotina gerencial (GAP_ROTINA_GERENCIAL)

| q_id | Pergunta | Tipo |
|------|----------|------|
| ROTINA_Q1 | Existe reunião semanal de gestão com pauta fixa (resultado, prioridades e pendências)? | LIKERT_5 |
| ROTINA_Q2 | As decisões viram tarefas com responsável e prazo (e alguém cobra depois)? | LIKERT_5 |
| ROTINA_Q3 | Você tem poucos números essenciais acompanhados toda semana (caixa, vendas, entrega)? | LIKERT_5 |
| ROTINA_Q4 | Quando alguém não entrega, existe consequência ou ajuste imediato? | LIKERT_5 |

---

## 3. Lógica de classificação (em português)

### 3.1 Regra SCORE_WEIGHTS

Para cada pergunta, a resposta atribui pontos a uma ou mais causas:

- **Discordo plenamente** → 3 pontos
- **Discordo** → 2 pontos
- **Neutro** → 1 ponto
- **Concordo** / **Concordo plenamente** → 0 pontos

Cada pergunta está mapeada a uma causa específica. O sistema soma os pontos por causa. A causa com **maior pontuação** é a causa primária.

### 3.2 Empate (tie-breaker)

Se duas ou mais causas tiverem a mesma pontuação, a ordem de prioridade é definida pelo **tie-breaker** (lista fixa por gap):

**Caixa:** CAUSE_RITUAL > CAUSE_RESPONSAVEL > CAUSE_DADOS > CAUSE_GOVERNANCA > CAUSE_CAPACIDADE > CAUSE_INCENTIVOS

**Vendas:** CAUSE_RITUAL > CAUSE_DADOS > CAUSE_RESPONSAVEL > CAUSE_INCENTIVOS > CAUSE_GOVERNANCA > CAUSE_CAPACIDADE

**Rotina gerencial:** CAUSE_RITUAL > CAUSE_GOVERNANCA > CAUSE_RESPONSAVEL > CAUSE_DADOS > CAUSE_CAPACIDADE > CAUSE_INCENTIVOS

### 3.3 Causa secundária

Apenas se houver regra explícita de proximidade (ex.: diferença de 1 ponto entre 1ª e 2ª). No MVP atual, a lógica pode retornar secundária quando `topScore - segundoScore <= 1`.

### 3.4 Mapeamento pergunta → causa (por gap)

**Caixa:**

| Pergunta | Causa |
|----------|-------|
| CAIXA_Q1 (rotina semanal) | CAUSE_RITUAL |
| CAIXA_Q2 (registro entradas/saídas) | CAUSE_DADOS |
| CAIXA_Q3 (responsável) | CAUSE_RESPONSAVEL |
| CAIXA_Q4 (confiança nos números) | CAUSE_DADOS |

**Vendas:**

| Pergunta | Causa |
|----------|-------|
| VENDAS_Q1 (reunião semanal) | CAUSE_RITUAL |
| VENDAS_Q2 (registro funil) | CAUSE_DADOS |
| VENDAS_Q3 (responsável) | CAUSE_RESPONSAVEL |
| VENDAS_Q4 (comissão/bonificação) | CAUSE_INCENTIVOS |

**Rotina gerencial:**

| Pergunta | Causa |
|----------|-------|
| ROTINA_Q1 (reunião gestão) | CAUSE_RITUAL |
| ROTINA_Q2 (decisões viram tarefas) | CAUSE_GOVERNANCA |
| ROTINA_Q3 (números essenciais) | CAUSE_DADOS |
| ROTINA_Q4 (consequência) | CAUSE_RESPONSAVEL |

---

## 4. Mecanismo resultante e ações sugeridas

### 4.1 Caixa (ADM_FIN)

| Causa | Mecanismo | Ações sugeridas |
|-------|-----------|-----------------|
| CAUSE_RITUAL | Instalar rotina semanal | ADM_FIN-ROTINA_CAIXA_SEMANAL, ADM_FIN-DONO_CAIXA, ADM_FIN-REGISTRO_ENTRADAS_SAIDAS |
| CAUSE_DADOS | Instrumentação mínima | Idem |
| CAUSE_RESPONSAVEL | Nomear responsável | Idem |
| CAUSE_GOVERNANCA | Definir dono + cobrança | Idem |

**Ações (catalog):**

| action_key | Título |
|------------|--------|
| ADM_FIN-ROTINA_CAIXA_SEMANAL | Criar rotina semanal do caixa (30 dias) |
| ADM_FIN-DONO_CAIXA | Definir responsável pelo caixa e cobrança |
| ADM_FIN-REGISTRO_ENTRADAS_SAIDAS | Registrar entradas e saídas futuras |

### 4.2 Vendas (COMERCIAL)

| Causa | Mecanismo | Ações sugeridas |
|-------|-----------|-----------------|
| CAUSE_RITUAL | Instalar rotina semanal | COMERCIAL-ROTINA_SEMANAL, COMERCIAL-FUNIL_MINIMO, COMERCIAL-FOLLOWUP_PADRAO |
| CAUSE_DADOS | Instrumentação mínima | Idem |
| CAUSE_RESPONSAVEL | Nomear responsável | Idem |
| CAUSE_INCENTIVOS | Ajustar regra de incentivo | Idem |

**Ações (catalog):**

| action_key | Título |
|------------|--------|
| COMERCIAL-ROTINA_SEMANAL | Instalar rotina semanal comercial |
| COMERCIAL-FUNIL_MINIMO | Criar funil mínimo (CRM ou planilha) |
| COMERCIAL-FOLLOWUP_PADRAO | Padronizar follow-up (prazo e responsabilidade) |

### 4.3 Rotina gerencial (GESTAO)

| Causa | Mecanismo | Ações sugeridas |
|-------|-----------|-----------------|
| CAUSE_RITUAL | Instalar rotina semanal | GESTAO-REUNIAO_SEMANAL, GESTAO-FECHAMENTO_PENDENCIAS, GESTAO-PAINEL_SEMANAL |
| CAUSE_GOVERNANCA | Definir dono + cobrança | Idem |
| CAUSE_RESPONSAVEL | Nomear responsável | Idem |
| CAUSE_DADOS | Instrumentação mínima | Idem |

**Ações (catalog):**

| action_key | Título |
|------------|--------|
| GESTAO-REUNIAO_SEMANAL | Criar reunião semanal de gestão (30–45 min) |
| GESTAO-FECHAMENTO_PENDENCIAS | Fechar pendências (responsável + data + cobrança) |
| GESTAO-PAINEL_SEMANAL | Acompanhar 3 números essenciais semanalmente |

---

## 5. Tags e segmentos

- **Processo:** ADM_FIN, COMERCIAL, GESTAO
- **Banda:** LOW (ações do Motor de Causa)
- **Segmento:** C, I, S (todas as ações aplicáveis a todos os segmentos)

---

## 6. Seeds e execução

```bash
npm run db:seed:cause-mvp
```

Ou como parte do seed completo:

```bash
npm run db:seed
```

Arquivos: `db/seed/009_seed_full_cause_taxonomy.sql`, `db/seed/010_seed_full_cause_mvp.sql`
