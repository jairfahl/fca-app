require('dotenv').config();
const path = require('path');
const dotenv = require('dotenv');

// Load env from repo root
const envPath = path.resolve(__dirname, '../../../.env');
dotenv.config({ path: envPath });

const { createPgPool } = require('../lib/dbSsl');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERRO: DATABASE_URL não configurada no .env');
  process.exit(1);
}

// Usar helper que aplica DB_SSL_RELAXED e guardrail de produção
const pool = createPgPool();

// Recomendações F3 - estrutura completa com process, segment, why, risk, impact, checklist_json, trigger_json
const recommendations = [
  // COMERCIAL - SERVICOS
  {
    process: 'COMERCIAL',
    segment: 'SERVICOS',
    title: 'Implementar CRM para gestão de clientes',
    why: 'Centralizar informações de clientes aumenta eficiência e reduz perda de oportunidades.',
    risk: 'LOW',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Pesquisar e selecionar plataforma CRM adequada',
      'Treinar equipe comercial no uso do sistema',
      'Migrar dados de clientes existentes para o CRM',
      'Configurar automações de follow-up e lembretes'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 50 })
  },
  {
    process: 'COMERCIAL',
    segment: 'SERVICOS',
    title: 'Criar processo de prospecção estruturado',
    why: 'Metodologia clara aumenta taxa de conversão e reduz tempo perdido.',
    risk: 'LOW',
    impact: 'MED',
    checklist_json: JSON.stringify([
      'Definir perfil de cliente ideal (ICP)',
      'Criar script de abordagem inicial',
      'Estabelecer metas de prospecção por vendedor',
      'Implementar sistema de acompanhamento de leads'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 60 })
  },
  {
    process: 'COMERCIAL',
    segment: 'SERVICOS',
    title: 'Desenvolver material de apresentação padronizado',
    why: 'Apresentações profissionais aumentam credibilidade e fechamento de vendas.',
    risk: 'LOW',
    impact: 'MED',
    checklist_json: JSON.stringify([
      'Criar template de apresentação da empresa',
      'Desenvolver cases de sucesso e depoimentos',
      'Preparar material sobre produtos/serviços',
      'Treinar equipe na apresentação padronizada'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 70 })
  },
  {
    process: 'COMERCIAL',
    segment: 'SERVICOS',
    title: 'Implementar follow-up automatizado de leads',
    why: 'Automação garante que nenhum lead seja perdido e aumenta conversão.',
    risk: 'LOW',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Configurar automações de email marketing',
      'Estabelecer prazos para contato inicial',
      'Criar sequência de follow-up por canal',
      'Monitorar taxa de conversão de leads'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 50 })
  },
  {
    process: 'COMERCIAL',
    segment: 'SERVICOS',
    title: 'Estabelecer programa de fidelização de clientes',
    why: 'Clientes fiéis geram receita recorrente e reduzem custos de aquisição.',
    risk: 'MED',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Desenvolver programa de benefícios e descontos',
      'Criar sistema de pontos ou recompensas',
      'Implementar comunicação regular com clientes',
      'Medir satisfação e NPS periodicamente'
    ]),
    trigger_json: JSON.stringify({ min_score: 30, max_score: 80 })
  },
  // COMERCIAL - COMERCIO
  {
    process: 'COMERCIAL',
    segment: 'COMERCIO',
    title: 'Implementar sistema de gestão de vendas',
    why: 'Controle de vendas melhora previsibilidade e gestão de estoque.',
    risk: 'LOW',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Escolher sistema de gestão adequado',
      'Treinar equipe de vendas',
      'Integrar com controle de estoque',
      'Configurar relatórios de vendas'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 50 })
  },
  {
    process: 'COMERCIAL',
    segment: 'COMERCIO',
    title: 'Criar estratégia de precificação dinâmica',
    why: 'Precificação adequada maximiza margem e competitividade.',
    risk: 'MED',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Analisar concorrência e preços de mercado',
      'Definir margens mínimas aceitáveis',
      'Criar tabela de descontos por volume',
      'Estabelecer processo de aprovação de preços'
    ]),
    trigger_json: JSON.stringify({ min_score: 40, max_score: 90 })
  },
  {
    process: 'COMERCIAL',
    segment: 'COMERCIO',
    title: 'Implementar análise de pipeline de vendas',
    why: 'Visibilidade do pipeline permite melhor planejamento e gestão.',
    risk: 'LOW',
    impact: 'MED',
    checklist_json: JSON.stringify([
      'Configurar visualização de pipeline',
      'Definir etapas do funil de vendas',
      'Estabelecer métricas de conversão por etapa',
      'Realizar reuniões semanais de análise'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 60 })
  },
  // COMERCIAL - INDUSTRIA
  {
    process: 'COMERCIAL',
    segment: 'INDUSTRIA',
    title: 'Desenvolver parcerias estratégicas',
    why: 'Parcerias ampliam canais de venda e alcance de mercado.',
    risk: 'MED',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Identificar potenciais parceiros complementares',
      'Criar proposta de parceria comercial',
      'Negociar termos e condições',
      'Estabelecer processo de gestão de parcerias'
    ]),
    trigger_json: JSON.stringify({ min_score: 30, max_score: 80 })
  },
  {
    process: 'COMERCIAL',
    segment: 'INDUSTRIA',
    title: 'Implementar análise de churn de clientes',
    why: 'Prevenir perda de clientes é mais eficiente que adquirir novos.',
    risk: 'LOW',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Monitorar sinais de insatisfação',
      'Estabelecer processo de retenção',
      'Criar ofertas especiais para clientes em risco',
      'Analisar causas raiz do churn'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 50 })
  },
  // COMERCIAL - ALL
  {
    process: 'COMERCIAL',
    segment: 'ALL',
    title: 'Treinar equipe em técnicas de negociação',
    why: 'Vendedores capacitados fecham mais negócios e com melhores margens.',
    risk: 'LOW',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Contratar treinamento especializado',
      'Realizar workshops práticos',
      'Criar role-plays de situações reais',
      'Acompanhar resultados pós-treinamento'
    ]),
    trigger_json: JSON.stringify({ min_score: 20, max_score: 70 })
  },
  {
    process: 'COMERCIAL',
    segment: 'ALL',
    title: 'Criar programa de indicação de clientes',
    why: 'Indicações têm maior taxa de conversão e menor custo de aquisição.',
    risk: 'LOW',
    impact: 'MED',
    checklist_json: JSON.stringify([
      'Definir benefícios para indicadores',
      'Criar processo de registro de indicações',
      'Desenvolver material de divulgação',
      'Monitorar taxa de conversão de indicações'
    ]),
    trigger_json: JSON.stringify({ min_score: 50, max_score: 100 })
  },
  // OPERACOES - SERVICOS
  {
    process: 'OPERACOES',
    segment: 'SERVICOS',
    title: 'Implementar controle de qualidade de serviços',
    why: 'Qualidade consistente aumenta satisfação e reduz retrabalho.',
    risk: 'LOW',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Definir padrões de qualidade',
      'Criar checklists de inspeção',
      'Estabelecer processo de não conformidade',
      'Implementar ações corretivas'
    ]),
    trigger_json: JSON.stringify({ min_score: 20, max_score: 70 })
  },
  {
    process: 'OPERACOES',
    segment: 'SERVICOS',
    title: 'Padronizar processos operacionais',
    why: 'Processos padronizados garantem consistência e eficiência.',
    risk: 'LOW',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Mapear processos atuais',
      'Criar documentação passo a passo',
      'Treinar equipe nos processos padronizados',
      'Estabelecer auditorias periódicas'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 60 })
  },
  {
    process: 'OPERACOES',
    segment: 'SERVICOS',
    title: 'Automatizar processos repetitivos',
    why: 'Automação libera tempo da equipe para atividades de maior valor.',
    risk: 'MED',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Mapear processos repetitivos',
      'Avaliar viabilidade de automação',
      'Implementar soluções automatizadas',
      'Treinar equipe nas novas ferramentas'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 60 })
  },
  {
    process: 'OPERACOES',
    segment: 'SERVICOS',
    title: 'Implementar gestão de equipe e escalas',
    why: 'Escalas bem organizadas garantem cobertura adequada e reduzem custos.',
    risk: 'LOW',
    impact: 'MED',
    checklist_json: JSON.stringify([
      'Definir necessidades de pessoal por período',
      'Criar sistema de escalas',
      'Implementar controle de ponto',
      'Estabelecer processo de substituições'
    ]),
    trigger_json: JSON.stringify({ min_score: 20, max_score: 70 })
  },
  {
    process: 'OPERACOES',
    segment: 'SERVICOS',
    title: 'Criar indicadores de desempenho operacional',
    why: 'KPIs permitem monitorar eficiência e identificar melhorias.',
    risk: 'LOW',
    impact: 'MED',
    checklist_json: JSON.stringify([
      'Definir KPIs relevantes',
      'Implementar sistema de coleta de dados',
      'Criar dashboards de acompanhamento',
      'Estabelecer metas e revisões periódicas'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 50 })
  },
  // OPERACOES - COMERCIO
  {
    process: 'OPERACOES',
    segment: 'COMERCIO',
    title: 'Implementar controle de estoque automatizado',
    why: 'Controle de estoque evita rupturas e excessos, otimizando capital.',
    risk: 'LOW',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Escolher software de gestão de estoque',
      'Cadastrar todos os produtos e SKUs',
      'Definir níveis mínimos e máximos',
      'Configurar alertas de reposição automática'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 50 })
  },
  {
    process: 'OPERACOES',
    segment: 'COMERCIO',
    title: 'Otimizar cadeia de suprimentos',
    why: 'Fornecedores eficientes reduzem custos e melhoram qualidade.',
    risk: 'MED',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Mapear fornecedores críticos',
      'Negociar melhores condições comerciais',
      'Estabelecer contratos de longo prazo',
      'Implementar avaliação de fornecedores'
    ]),
    trigger_json: JSON.stringify({ min_score: 30, max_score: 80 })
  },
  {
    process: 'OPERACOES',
    segment: 'COMERCIO',
    title: 'Implementar manutenção preventiva',
    why: 'Manutenção preventiva reduz paradas e custos de reparos.',
    risk: 'MED',
    impact: 'MED',
    checklist_json: JSON.stringify([
      'Cadastrar todos os equipamentos',
      'Definir cronograma de manutenção',
      'Criar sistema de registro de manutenções',
      'Treinar equipe em procedimentos básicos'
    ]),
    trigger_json: JSON.stringify({ min_score: 40, max_score: 90 })
  },
  {
    process: 'OPERACOES',
    segment: 'COMERCIO',
    title: 'Otimizar layout e fluxo de produção',
    why: 'Layout otimizado aumenta produtividade e reduz desperdícios.',
    risk: 'MED',
    impact: 'MED',
    checklist_json: JSON.stringify([
      'Analisar fluxo atual de processos',
      'Identificar gargalos e desperdícios',
      'Redesenhar layout físico',
      'Implementar melhorias e medir resultados'
    ]),
    trigger_json: JSON.stringify({ min_score: 30, max_score: 80 })
  },
  {
    process: 'OPERACOES',
    segment: 'COMERCIO',
    title: 'Implementar gestão de resíduos e sustentabilidade',
    why: 'Práticas sustentáveis reduzem custos e melhoram imagem.',
    risk: 'LOW',
    impact: 'LOW',
    checklist_json: JSON.stringify([
      'Mapear tipos e volumes de resíduos',
      'Estabelecer parcerias para reciclagem',
      'Implementar coleta seletiva',
      'Treinar equipe em práticas sustentáveis'
    ]),
    trigger_json: JSON.stringify({ min_score: 50, max_score: 100 })
  },
  // OPERACOES - INDUSTRIA
  {
    process: 'OPERACOES',
    segment: 'INDUSTRIA',
    title: 'Implementar gestão de segurança do trabalho',
    why: 'Segurança protege colaboradores e reduz custos com acidentes.',
    risk: 'HIGH',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Realizar análise de riscos',
      'Implementar EPIs obrigatórios',
      'Criar treinamentos de segurança',
      'Estabelecer comitê de segurança'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 40 })
  },
  {
    process: 'OPERACOES',
    segment: 'INDUSTRIA',
    title: 'Implementar controle de qualidade industrial',
    why: 'Qualidade consistente reduz retrabalho e aumenta satisfação.',
    risk: 'LOW',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Definir padrões de qualidade',
      'Criar checklists de inspeção',
      'Estabelecer processo de não conformidade',
      'Implementar ações corretivas'
    ]),
    trigger_json: JSON.stringify({ min_score: 20, max_score: 70 })
  },
  {
    process: 'OPERACOES',
    segment: 'INDUSTRIA',
    title: 'Otimizar processos de produção',
    why: 'Processos otimizados aumentam produtividade e reduzem custos.',
    risk: 'MED',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Mapear processos de produção',
      'Identificar gargalos e desperdícios',
      'Implementar melhorias',
      'Medir resultados e ajustar'
    ]),
    trigger_json: JSON.stringify({ min_score: 30, max_score: 80 })
  },
  {
    process: 'OPERACOES',
    segment: 'INDUSTRIA',
    title: 'Implementar manutenção preditiva',
    why: 'Manutenção preditiva reduz paradas não planejadas.',
    risk: 'MED',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Instalar sensores de monitoramento',
      'Implementar sistema de análise de dados',
      'Criar alertas automáticos',
      'Treinar equipe em interpretação'
    ]),
    trigger_json: JSON.stringify({ min_score: 50, max_score: 100 })
  },
  {
    process: 'OPERACOES',
    segment: 'INDUSTRIA',
    title: 'Criar indicadores de desempenho operacional',
    why: 'KPIs permitem monitorar eficiência e identificar melhorias.',
    risk: 'LOW',
    impact: 'MED',
    checklist_json: JSON.stringify([
      'Definir KPIs relevantes',
      'Implementar sistema de coleta de dados',
      'Criar dashboards de acompanhamento',
      'Estabelecer metas e revisões periódicas'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 50 })
  },
  // OPERACOES - ALL
  {
    process: 'OPERACOES',
    segment: 'ALL',
    title: 'Padronizar processos operacionais',
    why: 'Processos padronizados garantem consistência e eficiência.',
    risk: 'LOW',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Mapear processos atuais',
      'Criar documentação passo a passo',
      'Treinar equipe nos processos padronizados',
      'Estabelecer auditorias periódicas'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 60 })
  },
  {
    process: 'OPERACOES',
    segment: 'ALL',
    title: 'Automatizar processos repetitivos',
    why: 'Automação libera tempo da equipe para atividades de maior valor.',
    risk: 'MED',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Mapear processos repetitivos',
      'Avaliar viabilidade de automação',
      'Implementar soluções automatizadas',
      'Treinar equipe nas novas ferramentas'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 60 })
  },
  // ADM_FIN - SERVICOS
  {
    process: 'ADM_FIN',
    segment: 'SERVICOS',
    title: 'Implementar controle financeiro mensal',
    why: 'Controle financeiro permite tomar decisões informadas.',
    risk: 'LOW',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Definir estrutura de relatórios financeiros',
      'Estabelecer calendário de fechamento',
      'Criar dashboards de indicadores',
      'Realizar reuniões mensais de análise'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 50 })
  },
  {
    process: 'ADM_FIN',
    segment: 'SERVICOS',
    title: 'Automatizar conciliação bancária',
    why: 'Conciliação automatizada reduz erros e economiza tempo.',
    risk: 'LOW',
    impact: 'MED',
    checklist_json: JSON.stringify([
      'Integrar sistema com bancos',
      'Configurar regras de conciliação',
      'Automatizar importação de extratos',
      'Estabelecer processo de revisão'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 60 })
  },
  {
    process: 'ADM_FIN',
    segment: 'SERVICOS',
    title: 'Criar processo de controle de contas a pagar',
    why: 'Controle de pagamentos evita atrasos e multas.',
    risk: 'LOW',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Cadastrar todos os fornecedores',
      'Criar fluxo de aprovação de pagamentos',
      'Estabelecer calendário de pagamentos',
      'Implementar controle de vencimentos'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 50 })
  },
  {
    process: 'ADM_FIN',
    segment: 'SERVICOS',
    title: 'Implementar gestão de contas a receber',
    why: 'Controle de recebimentos melhora fluxo de caixa.',
    risk: 'LOW',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Automatizar emissão de boletos/faturas',
      'Criar processo de acompanhamento',
      'Estabelecer política de cobrança',
      'Implementar alertas de vencimento'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 50 })
  },
  {
    process: 'ADM_FIN',
    segment: 'SERVICOS',
    title: 'Implementar controle de fluxo de caixa',
    why: 'Fluxo de caixa previsto evita problemas de liquidez.',
    risk: 'LOW',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Implementar sistema de fluxo de caixa',
      'Criar projeções semanais e mensais',
      'Estabelecer processo de atualização',
      'Definir limites de saldo mínimo'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 50 })
  },
  // ADM_FIN - COMERCIO
  {
    process: 'ADM_FIN',
    segment: 'COMERCIO',
    title: 'Criar orçamento anual e acompanhamento',
    why: 'Orçamento permite planejamento e controle de desvios.',
    risk: 'LOW',
    impact: 'MED',
    checklist_json: JSON.stringify([
      'Definir metodologia de orçamento',
      'Criar projeções por centro de custo',
      'Estabelecer processo de aprovação',
      'Implementar acompanhamento mensal'
    ]),
    trigger_json: JSON.stringify({ min_score: 30, max_score: 80 })
  },
  {
    process: 'ADM_FIN',
    segment: 'COMERCIO',
    title: 'Otimizar gestão de impostos e obrigações',
    why: 'Gestão fiscal adequada evita multas e otimiza carga tributária.',
    risk: 'HIGH',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Mapear todas as obrigações fiscais',
      'Criar calendário de vencimentos',
      'Automatizar geração de guias',
      'Estabelecer processo de revisão'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 40 })
  },
  {
    process: 'ADM_FIN',
    segment: 'COMERCIO',
    title: 'Implementar análise de custos e margens',
    why: 'Análise de custos permite precificação adequada.',
    risk: 'MED',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Mapear estrutura de custos',
      'Implementar sistema de apuração',
      'Criar relatórios de margem',
      'Estabelecer análises periódicas'
    ]),
    trigger_json: JSON.stringify({ min_score: 30, max_score: 80 })
  },
  {
    process: 'ADM_FIN',
    segment: 'COMERCIO',
    title: 'Criar processo de gestão de contratos',
    why: 'Gestão de contratos evita problemas legais e financeiros.',
    risk: 'MED',
    impact: 'MED',
    checklist_json: JSON.stringify([
      'Cadastrar todos os contratos ativos',
      'Criar sistema de alertas de vencimento',
      'Estabelecer processo de renovação',
      'Implementar arquivo digital de contratos'
    ]),
    trigger_json: JSON.stringify({ min_score: 20, max_score: 70 })
  },
  {
    process: 'ADM_FIN',
    segment: 'COMERCIO',
    title: 'Implementar gestão de documentos fiscais',
    why: 'Organização de documentos facilita fiscalizações e auditorias.',
    risk: 'MED',
    impact: 'MED',
    checklist_json: JSON.stringify([
      'Digitalizar documentos físicos',
      'Implementar sistema de arquivo digital',
      'Criar processo de organização',
      'Estabelecer política de retenção'
    ]),
    trigger_json: JSON.stringify({ min_score: 20, max_score: 70 })
  },
  // ADM_FIN - INDUSTRIA
  {
    process: 'ADM_FIN',
    segment: 'INDUSTRIA',
    title: 'Criar processo de análise de investimentos',
    why: 'Análise adequada de investimentos reduz riscos e maximiza retorno.',
    risk: 'MED',
    impact: 'MED',
    checklist_json: JSON.stringify([
      'Definir critérios de avaliação',
      'Criar modelos de análise financeira',
      'Estabelecer processo de aprovação',
      'Implementar acompanhamento pós-investimento'
    ]),
    trigger_json: JSON.stringify({ min_score: 50, max_score: 100 })
  },
  {
    process: 'ADM_FIN',
    segment: 'INDUSTRIA',
    title: 'Implementar controle de custos de produção',
    why: 'Controle de custos permite otimização e melhoria de margens.',
    risk: 'MED',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Mapear custos de produção',
      'Implementar sistema de apuração',
      'Criar relatórios de custos',
      'Estabelecer análises periódicas'
    ]),
    trigger_json: JSON.stringify({ min_score: 30, max_score: 80 })
  },
  {
    process: 'ADM_FIN',
    segment: 'INDUSTRIA',
    title: 'Otimizar gestão de impostos e obrigações',
    why: 'Gestão fiscal adequada evita multas e otimiza carga tributária.',
    risk: 'HIGH',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Mapear todas as obrigações fiscais',
      'Criar calendário de vencimentos',
      'Automatizar geração de guias',
      'Estabelecer processo de revisão'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 40 })
  },
  {
    process: 'ADM_FIN',
    segment: 'INDUSTRIA',
    title: 'Implementar controle financeiro mensal',
    why: 'Controle financeiro permite tomar decisões informadas.',
    risk: 'LOW',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Definir estrutura de relatórios financeiros',
      'Estabelecer calendário de fechamento',
      'Criar dashboards de indicadores',
      'Realizar reuniões mensais de análise'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 50 })
  },
  {
    process: 'ADM_FIN',
    segment: 'INDUSTRIA',
    title: 'Criar processo de gestão de contratos',
    why: 'Gestão de contratos evita problemas legais e financeiros.',
    risk: 'MED',
    impact: 'MED',
    checklist_json: JSON.stringify([
      'Cadastrar todos os contratos ativos',
      'Criar sistema de alertas de vencimento',
      'Estabelecer processo de renovação',
      'Implementar arquivo digital de contratos'
    ]),
    trigger_json: JSON.stringify({ min_score: 20, max_score: 70 })
  },
  // ADM_FIN - ALL
  {
    process: 'ADM_FIN',
    segment: 'ALL',
    title: 'Implementar controle financeiro mensal',
    why: 'Controle financeiro permite tomar decisões informadas.',
    risk: 'LOW',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Definir estrutura de relatórios financeiros',
      'Estabelecer calendário de fechamento',
      'Criar dashboards de indicadores',
      'Realizar reuniões mensais de análise'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 50 })
  },
  {
    process: 'ADM_FIN',
    segment: 'ALL',
    title: 'Automatizar conciliação bancária',
    why: 'Conciliação automatizada reduz erros e economiza tempo.',
    risk: 'LOW',
    impact: 'MED',
    checklist_json: JSON.stringify([
      'Integrar sistema com bancos',
      'Configurar regras de conciliação',
      'Automatizar importação de extratos',
      'Estabelecer processo de revisão'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 60 })
  },
  // GESTAO - SERVICOS
  {
    process: 'GESTAO',
    segment: 'SERVICOS',
    title: 'Implementar planejamento estratégico anual',
    why: 'Planejamento estratégico direciona esforços e recursos.',
    risk: 'LOW',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Realizar análise SWOT',
      'Definir objetivos estratégicos',
      'Criar planos de ação por objetivo',
      'Estabelecer sistema de acompanhamento'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 60 })
  },
  {
    process: 'GESTAO',
    segment: 'SERVICOS',
    title: 'Criar sistema de indicadores de desempenho',
    why: 'KPIs permitem monitorar progresso e tomar decisões.',
    risk: 'LOW',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Definir KPIs estratégicos',
      'Implementar sistema de coleta',
      'Criar dashboards executivos',
      'Estabelecer reuniões de análise'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 50 })
  },
  {
    process: 'GESTAO',
    segment: 'SERVICOS',
    title: 'Implementar gestão de pessoas e desempenho',
    why: 'Gestão de pessoas aumenta engajamento e produtividade.',
    risk: 'LOW',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Definir competências por cargo',
      'Criar sistema de avaliação',
      'Estabelecer plano de desenvolvimento',
      'Implementar feedback contínuo'
    ]),
    trigger_json: JSON.stringify({ min_score: 20, max_score: 70 })
  },
  {
    process: 'GESTAO',
    segment: 'SERVICOS',
    title: 'Criar programa de comunicação interna',
    why: 'Comunicação eficiente alinha equipe e reduz conflitos.',
    risk: 'LOW',
    impact: 'MED',
    checklist_json: JSON.stringify([
      'Definir canais de comunicação',
      'Criar calendário de comunicações',
      'Estabelecer reuniões periódicas',
      'Implementar ferramentas colaborativas'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 60 })
  },
  {
    process: 'GESTAO',
    segment: 'SERVICOS',
    title: 'Implementar gestão de mudanças organizacionais',
    why: 'Gestão de mudanças reduz resistência e aumenta sucesso.',
    risk: 'MED',
    impact: 'MED',
    checklist_json: JSON.stringify([
      'Definir metodologia de gestão de mudanças',
      'Criar plano de comunicação',
      'Estabelecer processo de treinamento',
      'Implementar acompanhamento e ajustes'
    ]),
    trigger_json: JSON.stringify({ min_score: 30, max_score: 80 })
  },
  // GESTAO - COMERCIO
  {
    process: 'GESTAO',
    segment: 'COMERCIO',
    title: 'Criar processo de inovação contínua',
    why: 'Inovação mantém competitividade e crescimento.',
    risk: 'MED',
    impact: 'MED',
    checklist_json: JSON.stringify([
      'Criar canal de sugestões',
      'Estabelecer comitê de inovação',
      'Definir processo de avaliação',
      'Implementar projetos piloto'
    ]),
    trigger_json: JSON.stringify({ min_score: 40, max_score: 90 })
  },
  {
    process: 'GESTAO',
    segment: 'COMERCIO',
    title: 'Implementar gestão de riscos empresariais',
    why: 'Gestão de riscos protege o negócio e permite crescimento seguro.',
    risk: 'LOW',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Mapear riscos por área',
      'Avaliar probabilidade e impacto',
      'Criar planos de mitigação',
      'Estabelecer monitoramento contínuo'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 50 })
  },
  {
    process: 'GESTAO',
    segment: 'COMERCIO',
    title: 'Criar processo de tomada de decisão estruturada',
    why: 'Decisões estruturadas reduzem erros e aumentam assertividade.',
    risk: 'LOW',
    impact: 'MED',
    checklist_json: JSON.stringify([
      'Definir critérios de decisão',
      'Criar processo de análise',
      'Estabelecer níveis de aprovação',
      'Implementar registro de decisões'
    ]),
    trigger_json: JSON.stringify({ min_score: 30, max_score: 80 })
  },
  {
    process: 'GESTAO',
    segment: 'COMERCIO',
    title: 'Implementar gestão de conhecimento organizacional',
    why: 'Gestão de conhecimento preserva expertise e acelera aprendizado.',
    risk: 'LOW',
    impact: 'LOW',
    checklist_json: JSON.stringify([
      'Criar base de conhecimento',
      'Documentar processos e procedimentos',
      'Estabelecer processo de atualização',
      'Treinar equipe no uso da base'
    ]),
    trigger_json: JSON.stringify({ min_score: 50, max_score: 100 })
  },
  {
    process: 'GESTAO',
    segment: 'COMERCIO',
    title: 'Criar processo de governança e compliance',
    why: 'Governança garante conformidade e reduz riscos legais.',
    risk: 'LOW',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Mapear requisitos regulatórios',
      'Criar políticas e procedimentos',
      'Estabelecer controles internos',
      'Implementar auditorias periódicas'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 50 })
  },
  // GESTAO - INDUSTRIA
  {
    process: 'GESTAO',
    segment: 'INDUSTRIA',
    title: 'Implementar planejamento estratégico anual',
    why: 'Planejamento estratégico direciona esforços e recursos.',
    risk: 'LOW',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Realizar análise SWOT',
      'Definir objetivos estratégicos',
      'Criar planos de ação por objetivo',
      'Estabelecer sistema de acompanhamento'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 60 })
  },
  {
    process: 'GESTAO',
    segment: 'INDUSTRIA',
    title: 'Criar sistema de indicadores de desempenho',
    why: 'KPIs permitem monitorar progresso e tomar decisões.',
    risk: 'LOW',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Definir KPIs estratégicos',
      'Implementar sistema de coleta',
      'Criar dashboards executivos',
      'Estabelecer reuniões de análise'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 50 })
  },
  {
    process: 'GESTAO',
    segment: 'INDUSTRIA',
    title: 'Implementar gestão de pessoas e desempenho',
    why: 'Gestão de pessoas aumenta engajamento e produtividade.',
    risk: 'LOW',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Definir competências por cargo',
      'Criar sistema de avaliação',
      'Estabelecer plano de desenvolvimento',
      'Implementar feedback contínuo'
    ]),
    trigger_json: JSON.stringify({ min_score: 20, max_score: 70 })
  },
  {
    process: 'GESTAO',
    segment: 'INDUSTRIA',
    title: 'Implementar gestão de riscos empresariais',
    why: 'Gestão de riscos protege o negócio e permite crescimento seguro.',
    risk: 'LOW',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Mapear riscos por área',
      'Avaliar probabilidade e impacto',
      'Criar planos de mitigação',
      'Estabelecer monitoramento contínuo'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 50 })
  },
  {
    process: 'GESTAO',
    segment: 'INDUSTRIA',
    title: 'Criar processo de governança e compliance',
    why: 'Governança garante conformidade e reduz riscos legais.',
    risk: 'LOW',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Mapear requisitos regulatórios',
      'Criar políticas e procedimentos',
      'Estabelecer controles internos',
      'Implementar auditorias periódicas'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 50 })
  },
  // GESTAO - ALL
  {
    process: 'GESTAO',
    segment: 'ALL',
    title: 'Implementar planejamento estratégico anual',
    why: 'Planejamento estratégico direciona esforços e recursos.',
    risk: 'LOW',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Realizar análise SWOT',
      'Definir objetivos estratégicos',
      'Criar planos de ação por objetivo',
      'Estabelecer sistema de acompanhamento'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 60 })
  },
  {
    process: 'GESTAO',
    segment: 'ALL',
    title: 'Criar sistema de indicadores de desempenho',
    why: 'KPIs permitem monitorar progresso e tomar decisões.',
    risk: 'LOW',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Definir KPIs estratégicos',
      'Implementar sistema de coleta',
      'Criar dashboards executivos',
      'Estabelecer reuniões de análise'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 50 })
  },
  {
    process: 'GESTAO',
    segment: 'ALL',
    title: 'Implementar gestão de pessoas e desempenho',
    why: 'Gestão de pessoas aumenta engajamento e produtividade.',
    risk: 'LOW',
    impact: 'HIGH',
    checklist_json: JSON.stringify([
      'Definir competências por cargo',
      'Criar sistema de avaliação',
      'Estabelecer plano de desenvolvimento',
      'Implementar feedback contínuo'
    ]),
    trigger_json: JSON.stringify({ min_score: 20, max_score: 70 })
  },
  {
    process: 'GESTAO',
    segment: 'ALL',
    title: 'Criar programa de comunicação interna',
    why: 'Comunicação eficiente alinha equipe e reduz conflitos.',
    risk: 'LOW',
    impact: 'MED',
    checklist_json: JSON.stringify([
      'Definir canais de comunicação',
      'Criar calendário de comunicações',
      'Estabelecer reuniões periódicas',
      'Implementar ferramentas colaborativas'
    ]),
    trigger_json: JSON.stringify({ min_score: 0, max_score: 60 })
  },
  {
    process: 'GESTAO',
    segment: 'ALL',
    title: 'Implementar cultura de melhoria contínua',
    why: 'Cultura de melhoria contínua mantém competitividade.',
    risk: 'LOW',
    impact: 'MED',
    checklist_json: JSON.stringify([
      'Comunicar visão de melhoria contínua',
      'Reconhecer e celebrar melhorias',
      'Criar espaços para compartilhamento',
      'Estabelecer metas de melhoria por área'
    ]),
    trigger_json: JSON.stringify({ min_score: 30, max_score: 80 })
  }
];

/**
 * Executa seed idempotente de recomendações F3
 */
async function seedF3Recommendations() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    let inserted = 0;
    let updated = 0;
    
    for (const rec of recommendations) {
      // Verificar se já existe (por process + segment + title)
      const checkResult = await client.query(
        `SELECT id FROM public.recommendations_catalog 
         WHERE process = $1 AND segment = $2 AND title = $3`,
        [rec.process, rec.segment, rec.title]
      );
      
      if (checkResult.rows.length > 0) {
        // UPDATE
        await client.query(
          `UPDATE public.recommendations_catalog 
           SET why = $1, risk = $2, impact = $3, checklist_json = $4, 
               trigger_json = $5, active = TRUE
           WHERE process = $6 AND segment = $7 AND title = $8`,
          [
            rec.why,
            rec.risk,
            rec.impact,
            rec.checklist_json,
            rec.trigger_json,
            rec.process,
            rec.segment,
            rec.title
          ]
        );
        updated++;
      } else {
        // INSERT
        await client.query(
          `INSERT INTO public.recommendations_catalog 
           (process, segment, title, why, risk, impact, checklist_json, trigger_json, active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)`,
          [
            rec.process,
            rec.segment,
            rec.title,
            rec.why,
            rec.risk,
            rec.impact,
            rec.checklist_json,
            rec.trigger_json
          ]
        );
        inserted++;
      }
    }
    
    await client.query('COMMIT');
    
    const total = inserted + updated;
    console.log(`SEED OK: recommendations_catalog ${total}`);
    console.log(`  - Inseridas: ${inserted}`);
    console.log(`  - Atualizadas: ${updated}`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('ERRO ao executar seed:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Executa seed
 */
async function runSeed() {
  try {
    await seedF3Recommendations();
  } catch (error) {
    console.error('Erro fatal:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runSeed();
