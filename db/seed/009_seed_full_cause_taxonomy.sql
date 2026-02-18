-- Seed 009: Root Cause Engine — taxonomia e mecanismos (mínimo inicial)
-- Sem conteúdo de gaps ainda.

-- Taxonomia de causas (fechada)
INSERT INTO public.full_cause_taxonomy (id, label_cliente, descricao_cliente, mecanismo_primario, version)
VALUES
  ('CAUSE_GOVERNANCA', 'Falta de decisão e cobrança', 'As decisões não viram rotina e ninguém fecha o ciclo.', 'Definir dono + regra de cobrança + fechamento semanal', '1.0.0'),
  ('CAUSE_RITUAL', 'Falta de rotina', 'Sem cadência, tudo vira urgência e o básico não acontece.', 'Instalar rotina semanal (pauta fixa + registro + follow-up)', '1.0.0'),
  ('CAUSE_DADOS', 'Falta de números confiáveis', 'Sem números, a empresa decide no achismo.', 'Instrumentação mínima (registro + visão simples + atualização)', '1.0.0'),
  ('CAUSE_RESPONSAVEL', 'Falta de dono e responsabilidade', 'Não existe um responsável claro pelo resultado e pelo acompanhamento.', 'Nomear responsável, meta e consequência', '1.0.0'),
  ('CAUSE_CAPACIDADE', 'Falta de capacidade ou ferramenta', 'A operação não consegue sustentar o básico com o time/sistema atual.', 'Simplificar e padronizar o mínimo viável', '1.0.0'),
  ('CAUSE_INCENTIVOS', 'Incentivos desalinhados', 'O que se recompensa empurra a empresa para o comportamento errado.', 'Ajustar regra de incentivo para reforçar o que importa', '1.0.0')
ON CONFLICT (id) DO UPDATE SET
  label_cliente = EXCLUDED.label_cliente,
  descricao_cliente = EXCLUDED.descricao_cliente,
  mecanismo_primario = EXCLUDED.mecanismo_primario,
  version = EXCLUDED.version,
  updated_at = NOW();

-- Mecanismos (um por causa, mecanismo_primario)
INSERT INTO public.full_cause_mechanisms (cause_id, mechanism_key, label_cliente, descricao_cliente, sort_order, version)
VALUES
  ('CAUSE_GOVERNANCA', 'mecanismo_primario', 'Definir dono + regra de cobrança + fechamento semanal', 'Decisões viram rotina com cobrança.', 0, '1.0.0'),
  ('CAUSE_RITUAL', 'mecanismo_primario', 'Instalar rotina semanal (pauta fixa + registro + follow-up)', 'Cadência semanal sustenta o básico.', 0, '1.0.0'),
  ('CAUSE_DADOS', 'mecanismo_primario', 'Instrumentação mínima (registro + visão simples + atualização)', 'Números confiáveis para decisão.', 0, '1.0.0'),
  ('CAUSE_RESPONSAVEL', 'mecanismo_primario', 'Nomear responsável, meta e consequência', 'Dono claro por resultado.', 0, '1.0.0'),
  ('CAUSE_CAPACIDADE', 'mecanismo_primario', 'Simplificar e padronizar o mínimo viável', 'Operação sustenta o básico.', 0, '1.0.0'),
  ('CAUSE_INCENTIVOS', 'mecanismo_primario', 'Ajustar regra de incentivo para reforçar o que importa', 'Incentivos alinhados ao resultado.', 0, '1.0.0')
ON CONFLICT (cause_id, mechanism_key) DO UPDATE SET
  label_cliente = EXCLUDED.label_cliente,
  descricao_cliente = EXCLUDED.descricao_cliente,
  version = EXCLUDED.version,
  updated_at = NOW();

-- Opções LIKERT_5 (objetivas)
INSERT INTO public.full_cause_answer_options (question_type, option_value, label_cliente, sort_order, version)
VALUES
  ('LIKERT_5', 'DISCORDO_PLENAMENTE', 'Discordo plenamente', 0, '1.0.0'),
  ('LIKERT_5', 'DISCORDO', 'Discordo', 1, '1.0.0'),
  ('LIKERT_5', 'NEUTRO', 'Neutro', 2, '1.0.0'),
  ('LIKERT_5', 'CONCORDO', 'Concordo', 3, '1.0.0'),
  ('LIKERT_5', 'CONCORDO_PLENAMENTE', 'Concordo plenamente', 4, '1.0.0')
ON CONFLICT (question_type, option_value) DO UPDATE SET
  label_cliente = EXCLUDED.label_cliente,
  sort_order = EXCLUDED.sort_order,
  version = EXCLUDED.version;
