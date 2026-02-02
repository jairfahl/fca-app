-- Seed: Catálogo de Iniciativas FULL (F4-B)
-- 12 iniciativas determinísticas: 3 por processo (COMERCIAL, OPERACOES, ADM_FIN, GESTAO)

-- COMERCIAL (3 iniciativas)
insert into public.full_initiatives_catalog (
  process, segment, title, rationale, impact, horizon,
  prerequisites_json, dependencies_json, trigger_json, active
) values
(
  'COMERCIAL',
  'ALL',
  'Mapeamento de jornada do cliente',
  'Identificar pontos de contato críticos e gaps na experiência do cliente permite otimizar conversão e reduzir abandono.',
  'HIGH',
  'CURTO',
  '[]'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true
),
(
  'COMERCIAL',
  'ALL',
  'Segmentação de clientes por valor',
  'Classificar clientes por receita e potencial permite priorizar esforços comerciais e aumentar retenção de alto valor.',
  'MED',
  'MEDIO',
  '[]'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true
),
(
  'COMERCIAL',
  'ALL',
  'Análise de pipeline de vendas',
  'Monitorar estágios do funil e tempo médio de conversão identifica gargalos e melhora previsibilidade de receita.',
  'HIGH',
  'CURTO',
  '[]'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true
);

-- OPERACOES (3 iniciativas)
insert into public.full_initiatives_catalog (
  process, segment, title, rationale, impact, horizon,
  prerequisites_json, dependencies_json, trigger_json, active
) values
(
  'OPERACOES',
  'ALL',
  'Mapeamento de processos operacionais',
  'Documentar fluxos críticos de produção ou prestação de serviço reduz retrabalho e melhora padronização.',
  'HIGH',
  'CURTO',
  '[]'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true
),
(
  'OPERACOES',
  'ALL',
  'Análise de indicadores de desempenho',
  'Estabelecer KPIs operacionais e acompanhar métricas de eficiência permite identificar oportunidades de melhoria contínua.',
  'MED',
  'MEDIO',
  '[]'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true
),
(
  'OPERACOES',
  'ALL',
  'Gestão de fornecedores e qualidade',
  'Avaliar desempenho de fornecedores e implementar controles de qualidade reduz riscos e melhora confiabilidade da operação.',
  'HIGH',
  'MEDIO',
  '[]'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true
);

-- ADM_FIN (3 iniciativas)
insert into public.full_initiatives_catalog (
  process, segment, title, rationale, impact, horizon,
  prerequisites_json, dependencies_json, trigger_json, active
) values
(
  'ADM_FIN',
  'ALL',
  'Controle de fluxo de caixa',
  'Monitorar entradas e saídas com projeções de curto prazo evita problemas de liquidez e melhora gestão financeira.',
  'HIGH',
  'CURTO',
  '[]'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true
),
(
  'ADM_FIN',
  'ALL',
  'Análise de custos e margens',
  'Identificar custos fixos e variáveis por produto ou serviço permite otimizar precificação e aumentar rentabilidade.',
  'MED',
  'MEDIO',
  '[]'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true
),
(
  'ADM_FIN',
  'ALL',
  'Conformidade fiscal e tributária',
  'Garantir cumprimento de obrigações fiscais e manter documentação atualizada reduz riscos de multas e autuações.',
  'HIGH',
  'MEDIO',
  '[]'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true
);

-- GESTAO (3 iniciativas)
insert into public.full_initiatives_catalog (
  process, segment, title, rationale, impact, horizon,
  prerequisites_json, dependencies_json, trigger_json, active
) values
(
  'GESTAO',
  'ALL',
  'Definição de metas e indicadores estratégicos',
  'Estabelecer objetivos claros e métricas de acompanhamento alinha equipe e permite avaliar progresso em direção aos resultados desejados.',
  'HIGH',
  'MEDIO',
  '[]'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true
),
(
  'GESTAO',
  'ALL',
  'Estruturação de governança e responsabilidades',
  'Definir papéis, responsabilidades e processos de decisão melhora comunicação e reduz conflitos organizacionais.',
  'MED',
  'CURTO',
  '[]'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true
),
(
  'GESTAO',
  'ALL',
  'Planejamento de crescimento e escalabilidade',
  'Antecipar necessidades de recursos e estrutura para crescimento futuro evita gargalos e permite expansão sustentável.',
  'MED',
  'MEDIO',
  '[]'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb,
  true
);
