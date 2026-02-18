-- Seed 010: Root Cause Engine MVP — 3 gaps com question sets, regras e ações
-- Gaps: Caixa/contas a receber, Vendas/pipeline, Rotina gerencial

-- ============================================================================
-- 1. Ações no full_action_catalog (criar se não existirem)
-- ============================================================================

INSERT INTO public.full_action_catalog (process_key, band, action_key, title, benefit_text, metric_hint, dod_checklist, segment_applicability, is_active)
VALUES
  ('ADM_FIN', 'LOW', 'ADM_FIN-ROTINA_CAIXA_SEMANAL', 'Criar rotina semanal do caixa (30 dias)', 'Sem rotina, o caixa vira surpresa.', 'Definir dia fixo e atualizar projeção toda semana.', '["Definir dia fixo", "Atualizar projeção semanalmente", "Sinalizar desvios"]'::jsonb, ARRAY['C','I','S'], TRUE),
  ('ADM_FIN', 'LOW', 'ADM_FIN-DONO_CAIXA', 'Definir responsável pelo caixa e cobrança', 'Sem dono, ninguém sustenta o básico.', 'Nomear dono e combinar regra de cobrança semanal.', '["Nomear responsável", "Definir regra de cobrança", "Revisar semanalmente"]'::jsonb, ARRAY['C','I','S'], TRUE),
  ('ADM_FIN', 'LOW', 'ADM_FIN-REGISTRO_ENTRADAS_SAIDAS', 'Registrar entradas e saídas futuras', 'Sem registro, não existe previsão.', 'Criar planilha simples ou relatório mínimo e atualizar semanalmente.', '["Criar planilha ou relatório", "Atualizar semanalmente", "Comparar com realizado"]'::jsonb, ARRAY['C','I','S'], TRUE),
  ('COMERCIAL', 'LOW', 'COMERCIAL-ROTINA_SEMANAL', 'Instalar rotina semanal comercial', 'Sem cadência, o time não fecha ciclo e perde oportunidade.', 'Definir dia fixo, pauta e lista de pendências.', '["Definir dia fixo", "Preparar pauta", "Registrar pendências"]'::jsonb, ARRAY['C','I','S'], TRUE),
  ('COMERCIAL', 'LOW', 'COMERCIAL-FUNIL_MINIMO', 'Criar funil mínimo (CRM ou planilha)', 'Sem funil, você não enxerga nem prioriza.', 'Definir etapas e atualizar toda semana.', '["Definir etapas", "Atualizar semanalmente", "Priorizar oportunidades"]'::jsonb, ARRAY['C','I','S'], TRUE),
  ('COMERCIAL', 'LOW', 'COMERCIAL-FOLLOWUP_PADRAO', 'Padronizar follow-up (prazo e responsabilidade)', 'O maior vazamento é oportunidade sem próximo passo.', 'Definir regra: toda oportunidade tem próximo passo e data.', '["Definir regra de follow-up", "Atribuir responsável", "Cobrar prazos"]'::jsonb, ARRAY['C','I','S'], TRUE),
  ('GESTAO', 'LOW', 'GESTAO-REUNIAO_SEMANAL', 'Criar reunião semanal de gestão (30–45 min)', 'Sem rotina, nada sustenta.', 'Definir pauta fixa e horário semanal.', '["Definir pauta fixa", "Reservar horário", "Registrar decisões"]'::jsonb, ARRAY['C','I','S'], TRUE),
  ('GESTAO', 'LOW', 'GESTAO-FECHAMENTO_PENDENCIAS', 'Fechar pendências (responsável + data + cobrança)', 'Decisão sem cobrança vira conversa.', 'Toda decisão vira tarefa com dono e prazo.', '["Registrar tarefas", "Atribuir dono e prazo", "Cobrar fechamento"]'::jsonb, ARRAY['C','I','S'], TRUE),
  ('GESTAO', 'LOW', 'GESTAO-PAINEL_SEMANAL', 'Acompanhar 3 números essenciais semanalmente', 'Sem números, a gestão vira opinião.', 'Definir 3 números e revisar na reunião semanal.', '["Definir 3 números", "Revisar semanalmente", "Ajustar quando necessário"]'::jsonb, ARRAY['C','I','S'], TRUE)
ON CONFLICT (process_key, band, action_key) DO UPDATE SET
  title = EXCLUDED.title,
  benefit_text = EXCLUDED.benefit_text,
  metric_hint = EXCLUDED.metric_hint,
  dod_checklist = EXCLUDED.dod_checklist,
  segment_applicability = EXCLUDED.segment_applicability,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- ============================================================================
-- 2. Question sets (3 gaps)
-- ============================================================================

INSERT INTO public.full_cause_question_sets (gap_id, process_key, titulo_cliente, descricao_cliente, version, is_active)
VALUES
  ('GAP_CAIXA_PREVISAO', 'ADM_FIN', 'Caixa imprevisível', 'Você não consegue prever o caixa com antecedência.', '1.0.0', TRUE),
  ('GAP_VENDAS_FUNIL', 'COMERCIAL', 'Vendas sem previsibilidade', 'Você não sabe o que vai vender nas próximas semanas.', '1.0.0', TRUE),
  ('GAP_ROTINA_GERENCIAL', 'GESTAO', 'Sem rotina gerencial (empresa no improviso)', 'A empresa corre atrás do urgente e não sustenta o básico.', '1.0.0', TRUE)
ON CONFLICT (gap_id, version) DO UPDATE SET
  titulo_cliente = EXCLUDED.titulo_cliente,
  descricao_cliente = EXCLUDED.descricao_cliente,
  updated_at = NOW();

-- ============================================================================
-- 3. Perguntas (4 por gap, LIKERT_5)
-- ============================================================================

-- Caixa
INSERT INTO public.full_cause_questions (question_set_id, q_id, texto_cliente, question_type, sort_order, is_active)
SELECT id, 'CAIXA_Q1', 'Existe uma rotina semanal para olhar o caixa dos próximos 30 dias?', 'LIKERT_5', 0, TRUE FROM public.full_cause_question_sets WHERE gap_id = 'GAP_CAIXA_PREVISAO' AND version = '1.0.0'
ON CONFLICT (question_set_id, q_id) DO UPDATE SET texto_cliente = EXCLUDED.texto_cliente;
INSERT INTO public.full_cause_questions (question_set_id, q_id, texto_cliente, question_type, sort_order, is_active)
SELECT id, 'CAIXA_Q2', 'As entradas e saídas futuras são registradas (mesmo que em planilha)?', 'LIKERT_5', 1, TRUE FROM public.full_cause_question_sets WHERE gap_id = 'GAP_CAIXA_PREVISAO' AND version = '1.0.0'
ON CONFLICT (question_set_id, q_id) DO UPDATE SET texto_cliente = EXCLUDED.texto_cliente;
INSERT INTO public.full_cause_questions (question_set_id, q_id, texto_cliente, question_type, sort_order, is_active)
SELECT id, 'CAIXA_Q3', 'Existe um responsável claro por atualizar e cobrar esse controle?', 'LIKERT_5', 2, TRUE FROM public.full_cause_question_sets WHERE gap_id = 'GAP_CAIXA_PREVISAO' AND version = '1.0.0'
ON CONFLICT (question_set_id, q_id) DO UPDATE SET texto_cliente = EXCLUDED.texto_cliente;
INSERT INTO public.full_cause_questions (question_set_id, q_id, texto_cliente, question_type, sort_order, is_active)
SELECT id, 'CAIXA_Q4', 'Você confia nos números (banco/contas a receber/contas a pagar) sem ajustes manuais frequentes?', 'LIKERT_5', 3, TRUE FROM public.full_cause_question_sets WHERE gap_id = 'GAP_CAIXA_PREVISAO' AND version = '1.0.0'
ON CONFLICT (question_set_id, q_id) DO UPDATE SET texto_cliente = EXCLUDED.texto_cliente;

-- Vendas
INSERT INTO public.full_cause_questions (question_set_id, q_id, texto_cliente, question_type, sort_order, is_active)
SELECT id, 'VENDAS_Q1', 'Existe uma reunião semanal comercial com pauta fixa?', 'LIKERT_5', 0, TRUE FROM public.full_cause_question_sets WHERE gap_id = 'GAP_VENDAS_FUNIL' AND version = '1.0.0'
ON CONFLICT (question_set_id, q_id) DO UPDATE SET texto_cliente = EXCLUDED.texto_cliente;
INSERT INTO public.full_cause_questions (question_set_id, q_id, texto_cliente, question_type, sort_order, is_active)
SELECT id, 'VENDAS_Q2', 'Existe registro mínimo do funil (CRM ou planilha) atualizado?', 'LIKERT_5', 1, TRUE FROM public.full_cause_question_sets WHERE gap_id = 'GAP_VENDAS_FUNIL' AND version = '1.0.0'
ON CONFLICT (question_set_id, q_id) DO UPDATE SET texto_cliente = EXCLUDED.texto_cliente;
INSERT INTO public.full_cause_questions (question_set_id, q_id, texto_cliente, question_type, sort_order, is_active)
SELECT id, 'VENDAS_Q3', 'Existe um responsável claro pelo resultado comercial e pela cobrança?', 'LIKERT_5', 2, TRUE FROM public.full_cause_question_sets WHERE gap_id = 'GAP_VENDAS_FUNIL' AND version = '1.0.0'
ON CONFLICT (question_set_id, q_id) DO UPDATE SET texto_cliente = EXCLUDED.texto_cliente;
INSERT INTO public.full_cause_questions (question_set_id, q_id, texto_cliente, question_type, sort_order, is_active)
SELECT id, 'VENDAS_Q4', 'A regra de comissão/bonificação reforça o comportamento certo (prospecção, follow-up, conversão)?', 'LIKERT_5', 3, TRUE FROM public.full_cause_question_sets WHERE gap_id = 'GAP_VENDAS_FUNIL' AND version = '1.0.0'
ON CONFLICT (question_set_id, q_id) DO UPDATE SET texto_cliente = EXCLUDED.texto_cliente;

-- Rotina gerencial
INSERT INTO public.full_cause_questions (question_set_id, q_id, texto_cliente, question_type, sort_order, is_active)
SELECT id, 'ROTINA_Q1', 'Existe reunião semanal de gestão com pauta fixa (resultado, prioridades e pendências)?', 'LIKERT_5', 0, TRUE FROM public.full_cause_question_sets WHERE gap_id = 'GAP_ROTINA_GERENCIAL' AND version = '1.0.0'
ON CONFLICT (question_set_id, q_id) DO UPDATE SET texto_cliente = EXCLUDED.texto_cliente;
INSERT INTO public.full_cause_questions (question_set_id, q_id, texto_cliente, question_type, sort_order, is_active)
SELECT id, 'ROTINA_Q2', 'As decisões viram tarefas com responsável e prazo (e alguém cobra depois)?', 'LIKERT_5', 1, TRUE FROM public.full_cause_question_sets WHERE gap_id = 'GAP_ROTINA_GERENCIAL' AND version = '1.0.0'
ON CONFLICT (question_set_id, q_id) DO UPDATE SET texto_cliente = EXCLUDED.texto_cliente;
INSERT INTO public.full_cause_questions (question_set_id, q_id, texto_cliente, question_type, sort_order, is_active)
SELECT id, 'ROTINA_Q3', 'Você tem poucos números essenciais acompanhados toda semana (caixa, vendas, entrega)?', 'LIKERT_5', 2, TRUE FROM public.full_cause_question_sets WHERE gap_id = 'GAP_ROTINA_GERENCIAL' AND version = '1.0.0'
ON CONFLICT (question_set_id, q_id) DO UPDATE SET texto_cliente = EXCLUDED.texto_cliente;
INSERT INTO public.full_cause_questions (question_set_id, q_id, texto_cliente, question_type, sort_order, is_active)
SELECT id, 'ROTINA_Q4', 'Quando alguém não entrega, existe consequência ou ajuste imediato?', 'LIKERT_5', 3, TRUE FROM public.full_cause_question_sets WHERE gap_id = 'GAP_ROTINA_GERENCIAL' AND version = '1.0.0'
ON CONFLICT (question_set_id, q_id) DO UPDATE SET texto_cliente = EXCLUDED.texto_cliente;

-- ============================================================================
-- 4. Regras (SCORE_WEIGHTS + tie_breaker)
-- ============================================================================

INSERT INTO public.full_cause_rules (question_set_id, rule_type, version, config_json, is_active)
SELECT id, 'SCORE_WEIGHTS', '1.0.0', '{
  "weights": [
    {"cause_id":"CAUSE_RITUAL","q_id":"CAIXA_Q1","map":{"DISCORDO_PLENAMENTE":3,"DISCORDO":2,"NEUTRO":1,"CONCORDO":0,"CONCORDO_PLENAMENTE":0}},
    {"cause_id":"CAUSE_DADOS","q_id":"CAIXA_Q2","map":{"DISCORDO_PLENAMENTE":3,"DISCORDO":2,"NEUTRO":1,"CONCORDO":0,"CONCORDO_PLENAMENTE":0}},
    {"cause_id":"CAUSE_RESPONSAVEL","q_id":"CAIXA_Q3","map":{"DISCORDO_PLENAMENTE":3,"DISCORDO":2,"NEUTRO":1,"CONCORDO":0,"CONCORDO_PLENAMENTE":0}},
    {"cause_id":"CAUSE_DADOS","q_id":"CAIXA_Q4","map":{"DISCORDO_PLENAMENTE":2,"DISCORDO":2,"NEUTRO":1,"CONCORDO":0,"CONCORDO_PLENAMENTE":0}}
  ],
  "tie_breaker":["CAUSE_RITUAL","CAUSE_RESPONSAVEL","CAUSE_DADOS","CAUSE_GOVERNANCA","CAUSE_CAPACIDADE","CAUSE_INCENTIVOS"]
}'::jsonb, TRUE
FROM public.full_cause_question_sets WHERE gap_id = 'GAP_CAIXA_PREVISAO' AND version = '1.0.0'
ON CONFLICT (question_set_id, version) DO UPDATE SET config_json = EXCLUDED.config_json;

INSERT INTO public.full_cause_rules (question_set_id, rule_type, version, config_json, is_active)
SELECT id, 'SCORE_WEIGHTS', '1.0.0', '{
  "weights": [
    {"cause_id":"CAUSE_RITUAL","q_id":"VENDAS_Q1","map":{"DISCORDO_PLENAMENTE":3,"DISCORDO":2,"NEUTRO":1,"CONCORDO":0,"CONCORDO_PLENAMENTE":0}},
    {"cause_id":"CAUSE_DADOS","q_id":"VENDAS_Q2","map":{"DISCORDO_PLENAMENTE":3,"DISCORDO":2,"NEUTRO":1,"CONCORDO":0,"CONCORDO_PLENAMENTE":0}},
    {"cause_id":"CAUSE_RESPONSAVEL","q_id":"VENDAS_Q3","map":{"DISCORDO_PLENAMENTE":3,"DISCORDO":2,"NEUTRO":1,"CONCORDO":0,"CONCORDO_PLENAMENTE":0}},
    {"cause_id":"CAUSE_INCENTIVOS","q_id":"VENDAS_Q4","map":{"DISCORDO_PLENAMENTE":2,"DISCORDO":2,"NEUTRO":1,"CONCORDO":0,"CONCORDO_PLENAMENTE":0}}
  ],
  "tie_breaker":["CAUSE_RITUAL","CAUSE_DADOS","CAUSE_RESPONSAVEL","CAUSE_INCENTIVOS","CAUSE_GOVERNANCA","CAUSE_CAPACIDADE"]
}'::jsonb, TRUE
FROM public.full_cause_question_sets WHERE gap_id = 'GAP_VENDAS_FUNIL' AND version = '1.0.0'
ON CONFLICT (question_set_id, version) DO UPDATE SET config_json = EXCLUDED.config_json;

INSERT INTO public.full_cause_rules (question_set_id, rule_type, version, config_json, is_active)
SELECT id, 'SCORE_WEIGHTS', '1.0.0', '{
  "weights": [
    {"cause_id":"CAUSE_RITUAL","q_id":"ROTINA_Q1","map":{"DISCORDO_PLENAMENTE":3,"DISCORDO":2,"NEUTRO":1,"CONCORDO":0,"CONCORDO_PLENAMENTE":0}},
    {"cause_id":"CAUSE_GOVERNANCA","q_id":"ROTINA_Q2","map":{"DISCORDO_PLENAMENTE":3,"DISCORDO":2,"NEUTRO":1,"CONCORDO":0,"CONCORDO_PLENAMENTE":0}},
    {"cause_id":"CAUSE_DADOS","q_id":"ROTINA_Q3","map":{"DISCORDO_PLENAMENTE":2,"DISCORDO":2,"NEUTRO":1,"CONCORDO":0,"CONCORDO_PLENAMENTE":0}},
    {"cause_id":"CAUSE_RESPONSAVEL","q_id":"ROTINA_Q4","map":{"DISCORDO_PLENAMENTE":2,"DISCORDO":2,"NEUTRO":1,"CONCORDO":0,"CONCORDO_PLENAMENTE":0}}
  ],
  "tie_breaker":["CAUSE_RITUAL","CAUSE_GOVERNANCA","CAUSE_RESPONSAVEL","CAUSE_DADOS","CAUSE_CAPACIDADE","CAUSE_INCENTIVOS"]
}'::jsonb, TRUE
FROM public.full_cause_question_sets WHERE gap_id = 'GAP_ROTINA_GERENCIAL' AND version = '1.0.0'
ON CONFLICT (question_set_id, version) DO UPDATE SET config_json = EXCLUDED.config_json;

-- ============================================================================
-- 5. Mapeamento gap+causa → ação (cada causa do gap pode sugerir as mesmas ações)
-- ============================================================================

-- GAP_CAIXA: 3 ações para causas RITUAL, DADOS, RESPONSAVEL, GOVERNANCA (as que aparecem nos weights)
INSERT INTO public.full_cause_mechanism_actions (gap_id, cause_id, action_key, titulo_cliente, porque, primeiro_passo_30d, sort_order, version, is_active)
VALUES
  ('GAP_CAIXA_PREVISAO', 'CAUSE_RITUAL', 'ADM_FIN-ROTINA_CAIXA_SEMANAL', 'Criar rotina semanal do caixa (30 dias)', 'Sem rotina, o caixa vira surpresa.', 'Definir dia fixo e atualizar projeção toda semana.', 0, '1.0.0', TRUE),
  ('GAP_CAIXA_PREVISAO', 'CAUSE_RITUAL', 'ADM_FIN-DONO_CAIXA', 'Definir responsável pelo caixa e cobrança', 'Sem dono, ninguém sustenta o básico.', 'Nomear dono e combinar regra de cobrança semanal.', 1, '1.0.0', TRUE),
  ('GAP_CAIXA_PREVISAO', 'CAUSE_RITUAL', 'ADM_FIN-REGISTRO_ENTRADAS_SAIDAS', 'Registrar entradas e saídas futuras', 'Sem registro, não existe previsão.', 'Criar planilha simples ou relatório mínimo e atualizar semanalmente.', 2, '1.0.0', TRUE),
  ('GAP_CAIXA_PREVISAO', 'CAUSE_DADOS', 'ADM_FIN-ROTINA_CAIXA_SEMANAL', 'Criar rotina semanal do caixa (30 dias)', 'Sem rotina, o caixa vira surpresa.', 'Definir dia fixo e atualizar projeção toda semana.', 0, '1.0.0', TRUE),
  ('GAP_CAIXA_PREVISAO', 'CAUSE_DADOS', 'ADM_FIN-DONO_CAIXA', 'Definir responsável pelo caixa e cobrança', 'Sem dono, ninguém sustenta o básico.', 'Nomear dono e combinar regra de cobrança semanal.', 1, '1.0.0', TRUE),
  ('GAP_CAIXA_PREVISAO', 'CAUSE_DADOS', 'ADM_FIN-REGISTRO_ENTRADAS_SAIDAS', 'Registrar entradas e saídas futuras', 'Sem registro, não existe previsão.', 'Criar planilha simples ou relatório mínimo e atualizar semanalmente.', 2, '1.0.0', TRUE),
  ('GAP_CAIXA_PREVISAO', 'CAUSE_RESPONSAVEL', 'ADM_FIN-ROTINA_CAIXA_SEMANAL', 'Criar rotina semanal do caixa (30 dias)', 'Sem rotina, o caixa vira surpresa.', 'Definir dia fixo e atualizar projeção toda semana.', 0, '1.0.0', TRUE),
  ('GAP_CAIXA_PREVISAO', 'CAUSE_RESPONSAVEL', 'ADM_FIN-DONO_CAIXA', 'Definir responsável pelo caixa e cobrança', 'Sem dono, ninguém sustenta o básico.', 'Nomear dono e combinar regra de cobrança semanal.', 1, '1.0.0', TRUE),
  ('GAP_CAIXA_PREVISAO', 'CAUSE_RESPONSAVEL', 'ADM_FIN-REGISTRO_ENTRADAS_SAIDAS', 'Registrar entradas e saídas futuras', 'Sem registro, não existe previsão.', 'Criar planilha simples ou relatório mínimo e atualizar semanalmente.', 2, '1.0.0', TRUE),
  ('GAP_CAIXA_PREVISAO', 'CAUSE_GOVERNANCA', 'ADM_FIN-ROTINA_CAIXA_SEMANAL', 'Criar rotina semanal do caixa (30 dias)', 'Sem rotina, o caixa vira surpresa.', 'Definir dia fixo e atualizar projeção toda semana.', 0, '1.0.0', TRUE),
  ('GAP_CAIXA_PREVISAO', 'CAUSE_GOVERNANCA', 'ADM_FIN-DONO_CAIXA', 'Definir responsável pelo caixa e cobrança', 'Sem dono, ninguém sustenta o básico.', 'Nomear dono e combinar regra de cobrança semanal.', 1, '1.0.0', TRUE),
  ('GAP_CAIXA_PREVISAO', 'CAUSE_GOVERNANCA', 'ADM_FIN-REGISTRO_ENTRADAS_SAIDAS', 'Registrar entradas e saídas futuras', 'Sem registro, não existe previsão.', 'Criar planilha simples ou relatório mínimo e atualizar semanalmente.', 2, '1.0.0', TRUE)
ON CONFLICT (gap_id, cause_id, action_key) DO UPDATE SET
  titulo_cliente = EXCLUDED.titulo_cliente,
  porque = EXCLUDED.porque,
  primeiro_passo_30d = EXCLUDED.primeiro_passo_30d,
  sort_order = EXCLUDED.sort_order;

-- GAP_VENDAS
INSERT INTO public.full_cause_mechanism_actions (gap_id, cause_id, action_key, titulo_cliente, porque, primeiro_passo_30d, sort_order, version, is_active)
VALUES
  ('GAP_VENDAS_FUNIL', 'CAUSE_RITUAL', 'COMERCIAL-ROTINA_SEMANAL', 'Instalar rotina semanal comercial', 'Sem cadência, o time não fecha ciclo e perde oportunidade.', 'Definir dia fixo, pauta e lista de pendências.', 0, '1.0.0', TRUE),
  ('GAP_VENDAS_FUNIL', 'CAUSE_RITUAL', 'COMERCIAL-FUNIL_MINIMO', 'Criar funil mínimo (CRM ou planilha)', 'Sem funil, você não enxerga nem prioriza.', 'Definir etapas e atualizar toda semana.', 1, '1.0.0', TRUE),
  ('GAP_VENDAS_FUNIL', 'CAUSE_RITUAL', 'COMERCIAL-FOLLOWUP_PADRAO', 'Padronizar follow-up (prazo e responsabilidade)', 'O maior vazamento é oportunidade sem próximo passo.', 'Definir regra: toda oportunidade tem próximo passo e data.', 2, '1.0.0', TRUE),
  ('GAP_VENDAS_FUNIL', 'CAUSE_DADOS', 'COMERCIAL-ROTINA_SEMANAL', 'Instalar rotina semanal comercial', 'Sem cadência, o time não fecha ciclo e perde oportunidade.', 'Definir dia fixo, pauta e lista de pendências.', 0, '1.0.0', TRUE),
  ('GAP_VENDAS_FUNIL', 'CAUSE_DADOS', 'COMERCIAL-FUNIL_MINIMO', 'Criar funil mínimo (CRM ou planilha)', 'Sem funil, você não enxerga nem prioriza.', 'Definir etapas e atualizar toda semana.', 1, '1.0.0', TRUE),
  ('GAP_VENDAS_FUNIL', 'CAUSE_DADOS', 'COMERCIAL-FOLLOWUP_PADRAO', 'Padronizar follow-up (prazo e responsabilidade)', 'O maior vazamento é oportunidade sem próximo passo.', 'Definir regra: toda oportunidade tem próximo passo e data.', 2, '1.0.0', TRUE),
  ('GAP_VENDAS_FUNIL', 'CAUSE_RESPONSAVEL', 'COMERCIAL-ROTINA_SEMANAL', 'Instalar rotina semanal comercial', 'Sem cadência, o time não fecha ciclo e perde oportunidade.', 'Definir dia fixo, pauta e lista de pendências.', 0, '1.0.0', TRUE),
  ('GAP_VENDAS_FUNIL', 'CAUSE_RESPONSAVEL', 'COMERCIAL-FUNIL_MINIMO', 'Criar funil mínimo (CRM ou planilha)', 'Sem funil, você não enxerga nem prioriza.', 'Definir etapas e atualizar toda semana.', 1, '1.0.0', TRUE),
  ('GAP_VENDAS_FUNIL', 'CAUSE_RESPONSAVEL', 'COMERCIAL-FOLLOWUP_PADRAO', 'Padronizar follow-up (prazo e responsabilidade)', 'O maior vazamento é oportunidade sem próximo passo.', 'Definir regra: toda oportunidade tem próximo passo e data.', 2, '1.0.0', TRUE),
  ('GAP_VENDAS_FUNIL', 'CAUSE_INCENTIVOS', 'COMERCIAL-ROTINA_SEMANAL', 'Instalar rotina semanal comercial', 'Sem cadência, o time não fecha ciclo e perde oportunidade.', 'Definir dia fixo, pauta e lista de pendências.', 0, '1.0.0', TRUE),
  ('GAP_VENDAS_FUNIL', 'CAUSE_INCENTIVOS', 'COMERCIAL-FUNIL_MINIMO', 'Criar funil mínimo (CRM ou planilha)', 'Sem funil, você não enxerga nem prioriza.', 'Definir etapas e atualizar toda semana.', 1, '1.0.0', TRUE),
  ('GAP_VENDAS_FUNIL', 'CAUSE_INCENTIVOS', 'COMERCIAL-FOLLOWUP_PADRAO', 'Padronizar follow-up (prazo e responsabilidade)', 'O maior vazamento é oportunidade sem próximo passo.', 'Definir regra: toda oportunidade tem próximo passo e data.', 2, '1.0.0', TRUE)
ON CONFLICT (gap_id, cause_id, action_key) DO UPDATE SET
  titulo_cliente = EXCLUDED.titulo_cliente,
  porque = EXCLUDED.porque,
  primeiro_passo_30d = EXCLUDED.primeiro_passo_30d,
  sort_order = EXCLUDED.sort_order;

-- GAP_ROTINA_GERENCIAL
INSERT INTO public.full_cause_mechanism_actions (gap_id, cause_id, action_key, titulo_cliente, porque, primeiro_passo_30d, sort_order, version, is_active)
VALUES
  ('GAP_ROTINA_GERENCIAL', 'CAUSE_RITUAL', 'GESTAO-REUNIAO_SEMANAL', 'Criar reunião semanal de gestão (30–45 min)', 'Sem rotina, nada sustenta.', 'Definir pauta fixa e horário semanal.', 0, '1.0.0', TRUE),
  ('GAP_ROTINA_GERENCIAL', 'CAUSE_RITUAL', 'GESTAO-FECHAMENTO_PENDENCIAS', 'Fechar pendências (responsável + data + cobrança)', 'Decisão sem cobrança vira conversa.', 'Toda decisão vira tarefa com dono e prazo.', 1, '1.0.0', TRUE),
  ('GAP_ROTINA_GERENCIAL', 'CAUSE_RITUAL', 'GESTAO-PAINEL_SEMANAL', 'Acompanhar 3 números essenciais semanalmente', 'Sem números, a gestão vira opinião.', 'Definir 3 números e revisar na reunião semanal.', 2, '1.0.0', TRUE),
  ('GAP_ROTINA_GERENCIAL', 'CAUSE_GOVERNANCA', 'GESTAO-REUNIAO_SEMANAL', 'Criar reunião semanal de gestão (30–45 min)', 'Sem rotina, nada sustenta.', 'Definir pauta fixa e horário semanal.', 0, '1.0.0', TRUE),
  ('GAP_ROTINA_GERENCIAL', 'CAUSE_GOVERNANCA', 'GESTAO-FECHAMENTO_PENDENCIAS', 'Fechar pendências (responsável + data + cobrança)', 'Decisão sem cobrança vira conversa.', 'Toda decisão vira tarefa com dono e prazo.', 1, '1.0.0', TRUE),
  ('GAP_ROTINA_GERENCIAL', 'CAUSE_GOVERNANCA', 'GESTAO-PAINEL_SEMANAL', 'Acompanhar 3 números essenciais semanalmente', 'Sem números, a gestão vira opinião.', 'Definir 3 números e revisar na reunião semanal.', 2, '1.0.0', TRUE),
  ('GAP_ROTINA_GERENCIAL', 'CAUSE_RESPONSAVEL', 'GESTAO-REUNIAO_SEMANAL', 'Criar reunião semanal de gestão (30–45 min)', 'Sem rotina, nada sustenta.', 'Definir pauta fixa e horário semanal.', 0, '1.0.0', TRUE),
  ('GAP_ROTINA_GERENCIAL', 'CAUSE_RESPONSAVEL', 'GESTAO-FECHAMENTO_PENDENCIAS', 'Fechar pendências (responsável + data + cobrança)', 'Decisão sem cobrança vira conversa.', 'Toda decisão vira tarefa com dono e prazo.', 1, '1.0.0', TRUE),
  ('GAP_ROTINA_GERENCIAL', 'CAUSE_RESPONSAVEL', 'GESTAO-PAINEL_SEMANAL', 'Acompanhar 3 números essenciais semanalmente', 'Sem números, a gestão vira opinião.', 'Definir 3 números e revisar na reunião semanal.', 2, '1.0.0', TRUE),
  ('GAP_ROTINA_GERENCIAL', 'CAUSE_DADOS', 'GESTAO-REUNIAO_SEMANAL', 'Criar reunião semanal de gestão (30–45 min)', 'Sem rotina, nada sustenta.', 'Definir pauta fixa e horário semanal.', 0, '1.0.0', TRUE),
  ('GAP_ROTINA_GERENCIAL', 'CAUSE_DADOS', 'GESTAO-FECHAMENTO_PENDENCIAS', 'Fechar pendências (responsável + data + cobrança)', 'Decisão sem cobrança vira conversa.', 'Toda decisão vira tarefa com dono e prazo.', 1, '1.0.0', TRUE),
  ('GAP_ROTINA_GERENCIAL', 'CAUSE_DADOS', 'GESTAO-PAINEL_SEMANAL', 'Acompanhar 3 números essenciais semanalmente', 'Sem números, a gestão vira opinião.', 'Definir 3 números e revisar na reunião semanal.', 2, '1.0.0', TRUE)
ON CONFLICT (gap_id, cause_id, action_key) DO UPDATE SET
  titulo_cliente = EXCLUDED.titulo_cliente,
  porque = EXCLUDED.porque,
  primeiro_passo_30d = EXCLUDED.primeiro_passo_30d,
  sort_order = EXCLUDED.sort_order;
