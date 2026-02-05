-- Seed minimo do catalogo FULL (Top-12) para ambiente local/dev
-- Garante que o endpoint /full/assessments/:id/initiatives tenha base para gerar 12 linhas

insert into public.full_initiatives_catalog (
  id, process, segment, title, rationale, impact, horizon,
  prerequisites_json, dependencies_json, trigger_json, active
)
values
  (gen_random_uuid(), 'COMERCIAL', 'ALL', 'Padronizar funil comercial', 'Define etapas e criterios claros para oportunidades.', 'HIGH', 'CURTO', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, true),
  (gen_random_uuid(), 'COMERCIAL', 'ALL', 'Revisar proposta de valor', 'Alinha mensagem ao publico e aumenta conversao.', 'MED', 'CURTO', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, true),
  (gen_random_uuid(), 'OPERACOES', 'ALL', 'Mapear processos criticos', 'Identifica gargalos e padroniza a execucao.', 'HIGH', 'CURTO', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, true),
  (gen_random_uuid(), 'OPERACOES', 'ALL', 'Definir indicadores operacionais', 'Cria rotina de acompanhamento e metas.', 'MED', 'CURTO', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, true),
  (gen_random_uuid(), 'ADM_FIN', 'ALL', 'Organizar fluxo de caixa', 'Garante visibilidade de entradas e saidas.', 'HIGH', 'CURTO', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, true),
  (gen_random_uuid(), 'ADM_FIN', 'ALL', 'Revisar custos recorrentes', 'Reduz desperdicios e melhora margem.', 'MED', 'CURTO', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, true),
  (gen_random_uuid(), 'GESTAO', 'ALL', 'Definir metas trimestrais', 'Direciona prioridades e foco do time.', 'HIGH', 'MED', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, true),
  (gen_random_uuid(), 'GESTAO', 'ALL', 'Criar rotina de gestao', 'Mantem execucao consistente e revisoes.', 'MED', 'MED', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, true),
  (gen_random_uuid(), 'COMERCIAL', 'ALL', 'Treinar time de vendas', 'Aumenta taxa de fechamento com melhor abordagem.', 'LOW', 'MED', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, true),
  (gen_random_uuid(), 'OPERACOES', 'ALL', 'Padronizar entregas', 'Evita retrabalho e melhora qualidade.', 'LOW', 'MED', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, true),
  (gen_random_uuid(), 'ADM_FIN', 'ALL', 'Classificar despesas', 'Permite analise de custos por categoria.', 'LOW', 'MED', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, true),
  (gen_random_uuid(), 'GESTAO', 'ALL', 'Documentar processos chave', 'Facilita treinamento e escalabilidade.', 'LOW', 'MED', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, true);
