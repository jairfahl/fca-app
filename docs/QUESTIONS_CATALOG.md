# Catálogo de perguntas — LIGHT, FULL e Causa raiz

Referência consolidada das perguntas dos diagnósticos. Fonte: `apps/web/src/app/diagnostico/page.tsx` (LIGHT), `catalogs/full/questions.json` (FULL), `catalogs/full/cause_engine.v1.json` (causa raiz).

---

## 1. Diagnóstico LIGHT (12 perguntas)

| # | Processo | Atividade | Pergunta |
|---|----------|-----------|----------|
| 1 | COMERCIAL | Prospecção | Você tem uma rotina consistente para gerar novos contatos e oportunidades de venda, toda semana, sem depender só de indicação? |
| 2 | COMERCIAL | Venda/Proposta | Você tem um processo claro para atender, entender a necessidade e apresentar uma proposta/orçamento de forma padronizada? |
| 3 | COMERCIAL | Fechamento | Você acompanha propostas em aberto e conduz a negociação até o 'sim' ou 'não', sem deixar oportunidades morrerem por falta de retorno? |
| 4 | OPERACOES | Planejamento | Após entregar, você confirma com o cliente se ficou satisfeito, registra problemas e corrige a causa para não repetir? |
| 5 | OPERACOES | Execução | A execução do trabalho segue um padrão mínimo (checklist/etapas), com responsável definido, evitando retrabalho e improviso? |
| 6 | OPERACOES | Pós-entrega | Após entregar, você confirma com o cliente se ficou satisfeito, registra problemas e corrige a causa para não repetir? |
| 7 | ADM_FIN | Sistemas | Você usa algum sistema ou método organizado (não só memória) para registrar vendas, contas, estoques e gerar informações do negócio? |
| 8 | ADM_FIN | Controles financeiros | Você controla contas a pagar/receber e fluxo de caixa com rotina definida, sabendo o saldo projetado das próximas semanas? |
| 9 | ADM_FIN | Pessoas/RH | Você tem clareza de papéis e responsabilidades e uma rotina simples para contratar, acompanhar e corrigir desempenho das pessoas? |
| 10 | GESTAO | Planejamento | Você define metas e prioridades do mês (vendas, entrega, caixa) e transforma isso em ações práticas para a equipe? |
| 11 | GESTAO | Acompanhamento | Você acompanha poucos indicadores essenciais (vendas, caixa, entrega) com frequência e toma ação quando sai do rumo? |
| 12 | GESTAO | Tomada de decisão | Você toma decisões com base em dados mínimos do negócio (e não só percepção), registrando o que decidiu e cobrando execução? |

*Nota: Em Operações, as perguntas variam por segmento (SERVICOS, COMERCIO, INDUSTRIA). A tabela acima usa o segmento padrão.*

---

## 2. Diagnóstico FULL (48 perguntas — 12 por processo)

### 2.1 COMERCIAL (12 perguntas)

| # | Key | Dimensão | Pergunta |
|---|-----|----------|----------|
| 1 | Q01 | EXISTENCIA | Existe definição clara de quem é o cliente ideal (ICP)? |
| 2 | Q02 | ROTINA | Há processo documentado de prospecção e qualificação de leads? |
| 3 | Q03 | DONO | Existe dono definido para pipeline e conversão? |
| 4 | Q04 | CONTROLE | Os indicadores comerciais são acompanhados com frequência? |
| 5 | Q05 | EXISTENCIA | Existe histórico de relacionamento com clientes centralizado? |
| 6 | Q06 | ROTINA | Há rotina de follow-up com leads e oportunidades? |
| 7 | Q07 | DONO | Quem é responsável por fechar negócios e atingir meta? |
| 8 | Q08 | CONTROLE | A taxa de conversão é medida e revisada? |
| 9 | Q09 | EXISTENCIA | Existe material de venda padronizado e atualizado? |
| 10 | Q10 | ROTINA | Há processo de pós-venda e renovação? |
| 11 | Q11 | DONO | Quem cuida da retenção e da expansão de conta? |
| 12 | Q12 | CONTROLE | O funil comercial é visualizado e analisado? |

### 2.2 OPERACOES (12 perguntas)

| # | Key | Dimensão | Pergunta |
|---|-----|----------|----------|
| 1 | Q01 | EXISTENCIA | Existe mapeamento dos processos principais de entrega? |
| 2 | Q02 | ROTINA | Há checklist ou procedimento documentado para a operação? |
| 3 | Q03 | DONO | Existe responsável claro por cada etapa crítica? |
| 4 | Q04 | CONTROLE | Os prazos e SLA são monitorados? |
| 5 | Q05 | EXISTENCIA | Existe padrão de qualidade definido para o produto/serviço? |
| 6 | Q06 | ROTINA | Há rotina de revisão e melhoria dos processos? |
| 7 | Q07 | DONO | Quem resolve problemas operacionais no dia a dia? |
| 8 | Q08 | CONTROLE | Os indicadores operacionais são acompanhados? |
| 9 | Q09 | EXISTENCIA | Existe controle de fornecedores e insumos? |
| 10 | Q10 | ROTINA | Há rotina de capacitação da equipe operacional? |
| 11 | Q11 | DONO | Quem responde por atrasos e retrabalho? |
| 12 | Q12 | CONTROLE | O tempo de ciclo é medido e otimizado? |

### 2.3 ADM_FIN (12 perguntas)

| # | Key | Dimensão | Pergunta |
|---|-----|----------|----------|
| 1 | Q01 | EXISTENCIA | Existe controle de entradas e saídas de caixa? |
| 2 | Q02 | ROTINA | Há rotina de conciliação bancária e conferência? |
| 3 | Q03 | DONO | Existe responsável por fechamento e relatórios financeiros? |
| 4 | Q04 | CONTROLE | O fluxo de caixa é projetado e acompanhado? |
| 5 | Q05 | EXISTENCIA | Existe separação entre despesas pessoais e empresariais? |
| 6 | Q06 | ROTINA | Há processo de aprovação para gastos acima de certo valor? |
| 7 | Q07 | DONO | Quem toma decisões de investimento e despesa? |
| 8 | Q08 | CONTROLE | As obrigações fiscais e trabalhistas são controladas? |
| 9 | Q09 | EXISTENCIA | Existe previsão de receita (D+7, D+30)? |
| 10 | Q10 | ROTINA | Há rotina de cobrança e acompanhamento de inadimplência? |
| 11 | Q11 | DONO | Quem cuida da tesouraria e liquidez? |
| 12 | Q12 | CONTROLE | O resultado é comparado com o planejado? |

### 2.4 GESTAO (12 perguntas)

| # | Key | Dimensão | Pergunta |
|---|-----|----------|----------|
| 1 | Q01 | EXISTENCIA | Existem metas claras e comunicadas para a equipe? |
| 2 | Q02 | ROTINA | Há reunião periódica de acompanhamento de resultados? |
| 3 | Q03 | DONO | Existe dono por área ou projeto? |
| 4 | Q04 | CONTROLE | Os indicadores de gestão são acompanhados? |
| 5 | Q05 | EXISTENCIA | Existe definição de papéis e responsabilidades? |
| 6 | Q06 | ROTINA | Há rotina de feedback e desenvolvimento de pessoas? |
| 7 | Q07 | DONO | Quem prioriza demandas e resolve conflitos? |
| 8 | Q08 | CONTROLE | O planejamento é revisado e ajustado? |
| 9 | Q09 | EXISTENCIA | Existe canal de comunicação estruturado com a equipe? |
| 10 | Q10 | ROTINA | Há ritual de retrospectiva e aprendizado? |
| 11 | Q11 | DONO | Quem é responsável por entregar o resultado geral? |
| 12 | Q12 | CONTROLE | Os riscos são identificados e mitigados? |

---

## 3. Perguntas de causa raiz (12 perguntas — 4 por gap)

*Tipo de resposta: LIKERT_5 (Discordo plenamente | Discordo | Neutro | Concordo | Concordo plenamente)*

### 3.1 GAP_CAIXA_PREVISAO (ADM_FIN) — Caixa imprevisível

| # | q_id | Pergunta |
|---|------|----------|
| 1 | CAIXA_Q1 | Existe uma rotina semanal para olhar o caixa dos próximos 30 dias? |
| 2 | CAIXA_Q2 | As entradas e saídas futuras são registradas (mesmo que em planilha)? |
| 3 | CAIXA_Q3 | Existe um responsável claro por atualizar e cobrar esse controle? |
| 4 | CAIXA_Q4 | Você confia nos números (banco/contas a receber/contas a pagar) sem ajustes manuais frequentes? |

### 3.2 GAP_VENDAS_FUNIL (COMERCIAL) — Vendas sem previsibilidade

| # | q_id | Pergunta |
|---|------|----------|
| 1 | VENDAS_Q1 | Existe uma reunião semanal comercial com pauta fixa? |
| 2 | VENDAS_Q2 | Existe registro mínimo do funil (CRM ou planilha) atualizado? |
| 3 | VENDAS_Q3 | Existe um responsável claro pelo resultado comercial e pela cobrança? |
| 4 | VENDAS_Q4 | A regra de comissão/bonificação reforça o comportamento certo (prospecção, follow-up, conversão)? |

### 3.3 GAP_ROTINA_GERENCIAL (GESTAO) — Sem rotina gerencial (empresa no improviso)

| # | q_id | Pergunta |
|---|------|----------|
| 1 | ROTINA_Q1 | Existe reunião semanal de gestão com pauta fixa (resultado, prioridades e pendências)? |
| 2 | ROTINA_Q2 | As decisões viram tarefas com responsável e prazo (e alguém cobra depois)? |
| 3 | ROTINA_Q3 | Você tem poucos números essenciais acompanhados toda semana (caixa, vendas, entrega)? |
| 4 | ROTINA_Q4 | Quando alguém não entrega, existe consequência ou ajuste imediato? |

---

## Arquivos de origem

| Tipo | Arquivo |
|------|---------|
| LIGHT | `apps/web/src/app/diagnostico/page.tsx` — função `buildQuestions()` |
| FULL | `catalogs/full/questions.json` — seed via `db/seed/seed-full-catalog.js` |
| Causa raiz | `catalogs/full/cause_engine.v1.json` — seed via `db/seed/010_seed_full_cause_mvp.sql` |
