const path = require('path');
const dotenv = require('dotenv');
const { parse } = require('pg-connection-string');

// Load env from repo root (single source of truth)
const envPath = path.resolve(__dirname, '../../../.env');
const result = dotenv.config({ path: envPath });
if (result.error) {
  console.warn('[ENV] SEED dotenv load failed:', result.error.message);
} else {
  console.log('[ENV] SEED dotenv path:', envPath);
}
console.log('[ENV] SEED cwd:', process.cwd());

const { createPgPool } = require('../lib/dbSsl');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERRO: DATABASE_URL não configurada no .env');
  process.exit(1);
}

try {
  const parsed = parse(DATABASE_URL);
  console.log('[ENV] SEED DATABASE_URL_HOST=', parsed.host || 'unknown');
  console.log('[ENV] SEED DATABASE_URL_DB=', parsed.database || 'unknown');
  console.log('[ENV] SEED DATABASE_URL_USER=', parsed.user ? `${parsed.user.slice(0, 4)}***` : 'unknown');
} catch {
  console.log('[ENV] SEED DATABASE_URL_HOST=INVALID');
}

// Usar helper que aplica DB_SSL_RELAXED e guardrail de produção
const pool = createPgPool();

// Recomendações por categoria
const recommendations = [
  // COMERCIAL (10+)
  {
    code: 'COM-001',
    title: 'Implementar CRM para gestão de clientes',
    description: 'Adotar sistema CRM para centralizar informações de clientes, histórico de vendas e oportunidades.',
    category: 'Comercial',
    priority: 'high',
    min_score: 0,
    max_score: 50,
    checklist: [
      'Pesquisar e selecionar plataforma CRM adequada',
      'Treinar equipe comercial no uso do sistema',
      'Migrar dados de clientes existentes para o CRM',
      'Configurar automações de follow-up e lembretes'
    ]
  },
  {
    code: 'COM-002',
    title: 'Criar processo de prospecção estruturado',
    description: 'Estabelecer metodologia clara para identificação e abordagem de novos clientes potenciais.',
    category: 'Comercial',
    priority: 'medium',
    min_score: 0,
    max_score: 60,
    checklist: [
      'Definir perfil de cliente ideal (ICP)',
      'Criar script de abordagem inicial',
      'Estabelecer metas de prospecção por vendedor',
      'Implementar sistema de acompanhamento de leads'
    ]
  },
  {
    code: 'COM-003',
    title: 'Desenvolver material de apresentação padronizado',
    description: 'Criar apresentações comerciais profissionais e atualizadas para uso da equipe de vendas.',
    category: 'Comercial',
    priority: 'medium',
    min_score: 0,
    max_score: 70,
    checklist: [
      'Criar template de apresentação da empresa',
      'Desenvolver cases de sucesso e depoimentos',
      'Preparar material sobre produtos/serviços',
      'Treinar equipe na apresentação padronizada'
    ]
  },
  {
    code: 'COM-004',
    title: 'Implementar follow-up automatizado de leads',
    description: 'Criar sistema de acompanhamento automático para garantir que nenhum lead seja perdido.',
    category: 'Comercial',
    priority: 'high',
    min_score: 0,
    max_score: 50,
    checklist: [
      'Configurar automações de email marketing',
      'Estabelecer prazos para contato inicial',
      'Criar sequência de follow-up por canal',
      'Monitorar taxa de conversão de leads'
    ]
  },
  {
    code: 'COM-005',
    title: 'Estabelecer programa de fidelização de clientes',
    description: 'Criar estratégias para aumentar retenção e lifetime value dos clientes existentes.',
    category: 'Comercial',
    priority: 'medium',
    min_score: 30,
    max_score: 80,
    checklist: [
      'Desenvolver programa de benefícios e descontos',
      'Criar sistema de pontos ou recompensas',
      'Implementar comunicação regular com clientes',
      'Medir satisfação e NPS periodicamente'
    ]
  },
  {
    code: 'COM-006',
    title: 'Treinar equipe em técnicas de negociação',
    description: 'Capacitar vendedores com técnicas modernas de negociação e fechamento de vendas.',
    category: 'Comercial',
    priority: 'high',
    min_score: 20,
    max_score: 70,
    checklist: [
      'Contratar treinamento especializado',
      'Realizar workshops práticos',
      'Criar role-plays de situações reais',
      'Acompanhar resultados pós-treinamento'
    ]
  },
  {
    code: 'COM-007',
    title: 'Criar estratégia de precificação dinâmica',
    description: 'Desenvolver metodologia para ajustar preços conforme mercado e condições comerciais.',
    category: 'Comercial',
    priority: 'medium',
    min_score: 40,
    max_score: 90,
    checklist: [
      'Analisar concorrência e preços de mercado',
      'Definir margens mínimas aceitáveis',
      'Criar tabela de descontos por volume',
      'Estabelecer processo de aprovação de preços'
    ]
  },
  {
    code: 'COM-008',
    title: 'Implementar análise de pipeline de vendas',
    description: 'Criar dashboards e relatórios para acompanhamento do funil de vendas em tempo real.',
    category: 'Comercial',
    priority: 'high',
    min_score: 0,
    max_score: 60,
    checklist: [
      'Configurar visualização de pipeline no CRM',
      'Definir etapas do funil de vendas',
      'Estabelecer métricas de conversão por etapa',
      'Realizar reuniões semanais de análise'
    ]
  },
  {
    code: 'COM-009',
    title: 'Desenvolver parcerias estratégicas',
    description: 'Estabelecer alianças comerciais para ampliar canais de venda e alcance de mercado.',
    category: 'Comercial',
    priority: 'medium',
    min_score: 30,
    max_score: 80,
    checklist: [
      'Identificar potenciais parceiros complementares',
      'Criar proposta de parceria comercial',
      'Negociar termos e condições',
      'Estabelecer processo de gestão de parcerias'
    ]
  },
  {
    code: 'COM-010',
    title: 'Criar programa de indicação de clientes',
    description: 'Implementar sistema de recompensas para clientes que indicarem novos negócios.',
    category: 'Comercial',
    priority: 'low',
    min_score: 50,
    max_score: 100,
    checklist: [
      'Definir benefícios para indicadores',
      'Criar processo de registro de indicações',
      'Desenvolver material de divulgação',
      'Monitorar taxa de conversão de indicações'
    ]
  },
  {
    code: 'COM-011',
    title: 'Implementar análise de churn de clientes',
    description: 'Criar processo para identificar e prevenir perda de clientes antes que ocorra.',
    category: 'Comercial',
    priority: 'high',
    min_score: 0,
    max_score: 50,
    checklist: [
      'Monitorar sinais de insatisfação',
      'Estabelecer processo de retenção',
      'Criar ofertas especiais para clientes em risco',
      'Analisar causas raiz do churn'
    ]
  },

  // OPERAÇÕES (10+)
  {
    code: 'OP-001',
    title: 'Implementar controle de estoque automatizado',
    description: 'Adotar sistema de gestão de estoque para evitar rupturas e excessos de inventário.',
    category: 'Operações',
    priority: 'high',
    min_score: 0,
    max_score: 50,
    checklist: [
      'Escolher software de gestão de estoque',
      'Cadastrar todos os produtos e SKUs',
      'Definir níveis mínimos e máximos',
      'Configurar alertas de reposição automática'
    ]
  },
  {
    code: 'OP-002',
    title: 'Padronizar processos operacionais',
    description: 'Documentar e padronizar todos os processos operacionais para garantir consistência.',
    category: 'Operações',
    priority: 'high',
    min_score: 0,
    max_score: 60,
    checklist: [
      'Mapear processos atuais',
      'Criar documentação passo a passo',
      'Treinar equipe nos processos padronizados',
      'Estabelecer auditorias periódicas'
    ]
  },
  {
    code: 'OP-003',
    title: 'Implementar gestão de qualidade',
    description: 'Criar sistema de controle de qualidade para produtos e serviços entregues.',
    category: 'Operações',
    priority: 'high',
    min_score: 20,
    max_score: 70,
    checklist: [
      'Definir padrões de qualidade',
      'Criar checklists de inspeção',
      'Estabelecer processo de não conformidade',
      'Implementar ações corretivas'
    ]
  },
  {
    code: 'OP-004',
    title: 'Otimizar cadeia de suprimentos',
    description: 'Melhorar relacionamento com fornecedores e processos de compras para reduzir custos.',
    category: 'Operações',
    priority: 'medium',
    min_score: 30,
    max_score: 80,
    checklist: [
      'Mapear fornecedores críticos',
      'Negociar melhores condições comerciais',
      'Estabelecer contratos de longo prazo',
      'Implementar avaliação de desemcedores'
    ]
  },
  {
    code: 'OP-005',
    title: 'Implementar manutenção preventiva',
    description: 'Criar programa de manutenção preventiva para equipamentos e instalações.',
    category: 'Operações',
    priority: 'medium',
    min_score: 40,
    max_score: 90,
    checklist: [
      'Cadastrar todos os equipamentos',
      'Definir cronograma de manutenção',
      'Criar sistema de registro de manutenções',
      'Treinar equipe em procedimentos básicos'
    ]
  },
  {
    code: 'OP-006',
    title: 'Automatizar processos repetitivos',
    description: 'Identificar e automatizar tarefas manuais para aumentar eficiência operacional.',
    category: 'Operações',
    priority: 'high',
    min_score: 0,
    max_score: 60,
    checklist: [
      'Mapear processos repetitivos',
      'Avaliar viabilidade de automação',
      'Implementar soluções automatizadas',
      'Treinar equipe nas novas ferramentas'
    ]
  },
  {
    code: 'OP-007',
    title: 'Implementar gestão de equipe e escalas',
    description: 'Criar sistema para organizar escalas de trabalho e distribuição de tarefas.',
    category: 'Operações',
    priority: 'medium',
    min_score: 20,
    max_score: 70,
    checklist: [
      'Definir necessidades de pessoal por período',
      'Criar sistema de escalas',
      'Implementar controle de ponto',
      'Estabelecer processo de substituições'
    ]
  },
  {
    code: 'OP-008',
    title: 'Criar indicadores de desempenho operacional',
    description: 'Estabelecer KPIs para monitorar eficiência e produtividade das operações.',
    category: 'Operações',
    priority: 'high',
    min_score: 0,
    max_score: 50,
    checklist: [
      'Definir KPIs relevantes',
      'Implementar sistema de coleta de dados',
      'Criar dashboards de acompanhamento',
      'Estabelecer metas e revisões periódicas'
    ]
  },
  {
    code: 'OP-009',
    title: 'Implementar gestão de segurança do trabalho',
    description: 'Criar programa de segurança para proteger colaboradores e cumprir normas.',
    category: 'Operações',
    priority: 'critical',
    min_score: 0,
    max_score: 40,
    checklist: [
      'Realizar análise de riscos',
      'Implementar EPIs obrigatórios',
      'Criar treinamentos de segurança',
      'Estabelecer comitê de segurança'
    ]
  },
  {
    code: 'OP-010',
    title: 'Otimizar layout e fluxo de produção',
    description: 'Reorganizar espaço físico e fluxos para aumentar produtividade e reduzir desperdícios.',
    category: 'Operações',
    priority: 'medium',
    min_score: 30,
    max_score: 80,
    checklist: [
      'Analisar fluxo atual de processos',
      'Identificar gargalos e desperdícios',
      'Redesenhar layout físico',
      'Implementar melhorias e medir resultados'
    ]
  },
  {
    code: 'OP-011',
    title: 'Implementar gestão de resíduos e sustentabilidade',
    description: 'Criar programa de gestão de resíduos e práticas sustentáveis nas operações.',
    category: 'Operações',
    priority: 'low',
    min_score: 50,
    max_score: 100,
    checklist: [
      'Mapear tipos e volumes de resíduos',
      'Estabelecer parcerias para reciclagem',
      'Implementar coleta seletiva',
      'Treinar equipe em práticas sustentáveis'
    ]
  },

  // ADMINISTRATIVO-FINANCEIRO (10+)
  {
    code: 'ADM-001',
    title: 'Implementar controle financeiro mensal',
    description: 'Criar processo de acompanhamento financeiro mensal com relatórios e análises.',
    category: 'Administrativo-Financeiro',
    priority: 'high',
    min_score: 0,
    max_score: 50,
    checklist: [
      'Definir estrutura de relatórios financeiros',
      'Estabelecer calendário de fechamento',
      'Criar dashboards de indicadores',
      'Realizar reuniões mensais de análise'
    ]
  },
  {
    code: 'ADM-002',
    title: 'Automatizar conciliação bancária',
    description: 'Implementar processo automatizado para conciliar extratos bancários com lançamentos.',
    category: 'Administrativo-Financeiro',
    priority: 'high',
    min_score: 0,
    max_score: 60,
    checklist: [
      'Integrar sistema com bancos',
      'Configurar regras de conciliação',
      'Automatizar importação de extratos',
      'Estabelecer processo de revisão'
    ]
  },
  {
    code: 'ADM-003',
    title: 'Criar processo de controle de contas a pagar',
    description: 'Estabelecer sistema organizado para gestão de fornecedores e pagamentos.',
    category: 'Administrativo-Financeiro',
    priority: 'high',
    min_score: 0,
    max_score: 50,
    checklist: [
      'Cadastrar todos os fornecedores',
      'Criar fluxo de aprovação de pagamentos',
      'Estabelecer calendário de pagamentos',
      'Implementar controle de vencimentos'
    ]
  },
  {
    code: 'ADM-004',
    title: 'Implementar gestão de contas a receber',
    description: 'Criar processo eficiente para controle de recebimentos e cobrança de clientes.',
    category: 'Administrativo-Financeiro',
    priority: 'high',
    min_score: 0,
    max_score: 50,
    checklist: [
      'Automatizar emissão de boletos/faturas',
      'Criar processo de acompanhamento',
      'Estabelecer política de cobrança',
      'Implementar alertas de vencimento'
    ]
  },
  {
    code: 'ADM-005',
    title: 'Criar orçamento anual e acompanhamento',
    description: 'Desenvolver processo de planejamento orçamentário e acompanhamento de desvios.',
    category: 'Administrativo-Financeiro',
    priority: 'medium',
    min_score: 30,
    max_score: 80,
    checklist: [
      'Definir metodologia de orçamento',
      'Criar projeções por centro de custo',
      'Estabelecer processo de aprovação',
      'Implementar acompanhamento mensal'
    ]
  },
  {
    code: 'ADM-006',
    title: 'Implementar controle de fluxo de caixa',
    description: 'Criar sistema para previsão e controle de entradas e saídas de recursos.',
    category: 'Administrativo-Financeiro',
    priority: 'high',
    min_score: 0,
    max_score: 50,
    checklist: [
      'Implementar sistema de fluxo de caixa',
      'Criar projeções semanais e mensais',
      'Estabelecer processo de atualização',
      'Definir limites de saldo mínimo'
    ]
  },
  {
    code: 'ADM-007',
    title: 'Otimizar gestão de impostos e obrigações',
    description: 'Organizar processos para cumprimento de obrigações fiscais e tributárias.',
    category: 'Administrativo-Financeiro',
    priority: 'critical',
    min_score: 0,
    max_score: 40,
    checklist: [
      'Mapear todas as obrigações fiscais',
      'Criar calendário de vencimentos',
      'Automatizar geração de guias',
      'Estabelecer processo de revisão'
    ]
  },
  {
    code: 'ADM-008',
    title: 'Implementar análise de custos e margens',
    description: 'Criar sistema para análise detalhada de custos e cálculo de margens por produto/serviço.',
    category: 'Administrativo-Financeiro',
    priority: 'medium',
    min_score: 30,
    max_score: 80,
    checklist: [
      'Mapear estrutura de custos',
      'Implementar sistema de apuração',
      'Criar relatórios de margem',
      'Estabelecer análises periódicas'
    ]
  },
  {
    code: 'ADM-009',
    title: 'Criar processo de gestão de contratos',
    description: 'Estabelecer sistema para controle de contratos, prazos e renovações.',
    category: 'Administrativo-Financeiro',
    priority: 'medium',
    min_score: 20,
    max_score: 70,
    checklist: [
      'Cadastrar todos os contratos ativos',
      'Criar sistema de alertas de vencimento',
      'Estabelecer processo de renovação',
      'Implementar arquivo digital de contratos'
    ]
  },
  {
    code: 'ADM-010',
    title: 'Implementar gestão de documentos fiscais',
    description: 'Organizar arquivo e controle de documentos fiscais e contábeis.',
    category: 'Administrativo-Financeiro',
    priority: 'medium',
    min_score: 20,
    max_score: 70,
    checklist: [
      'Digitalizar documentos físicos',
      'Implementar sistema de arquivo digital',
      'Criar processo de organização',
      'Estabelecer política de retenção'
    ]
  },
  {
    code: 'ADM-011',
    title: 'Criar processo de análise de investimentos',
    description: 'Desenvolver metodologia para avaliação de viabilidade de investimentos.',
    category: 'Administrativo-Financeiro',
    priority: 'low',
    min_score: 50,
    max_score: 100,
    checklist: [
      'Definir critérios de avaliação',
      'Criar modelos de análise financeira',
      'Estabelecer processo de aprovação',
      'Implementar acompanhamento pós-investimento'
    ]
  },

  // GESTÃO (10+)
  {
    code: 'GES-001',
    title: 'Implementar planejamento estratégico anual',
    description: 'Criar processo de definição de objetivos estratégicos e planos de ação anuais.',
    category: 'Gestão',
    priority: 'high',
    min_score: 0,
    max_score: 60,
    checklist: [
      'Realizar análise SWOT',
      'Definir objetivos estratégicos',
      'Criar planos de ação por objetivo',
      'Estabelecer sistema de acompanhamento'
    ]
  },
  {
    code: 'GES-002',
    title: 'Criar sistema de indicadores de desempenho',
    description: 'Estabelecer KPIs organizacionais e processo de monitoramento contínuo.',
    category: 'Gestão',
    priority: 'high',
    min_score: 0,
    max_score: 50,
    checklist: [
      'Definir KPIs estratégicos',
      'Implementar sistema de coleta',
      'Criar dashboards executivos',
      'Estabelecer reuniões de análise'
    ]
  },
  {
    code: 'GES-003',
    title: 'Implementar gestão de pessoas e desempenho',
    description: 'Criar processo de avaliação de desempenho e desenvolvimento de colaboradores.',
    category: 'Gestão',
    priority: 'high',
    min_score: 20,
    max_score: 70,
    checklist: [
      'Definir competências por cargo',
      'Criar sistema de avaliação',
      'Estabelecer plano de desenvolvimento',
      'Implementar feedback contínuo'
    ]
  },
  {
    code: 'GES-004',
    title: 'Criar programa de comunicação interna',
    description: 'Estabelecer canais e processos para comunicação eficiente entre equipes.',
    category: 'Gestão',
    priority: 'medium',
    min_score: 0,
    max_score: 60,
    checklist: [
      'Definir canais de comunicação',
      'Criar calendário de comunicações',
      'Estabelecer reuniões periódicas',
      'Implementar ferramentas colaborativas'
    ]
  },
  {
    code: 'GES-005',
    title: 'Implementar gestão de mudanças organizacionais',
    description: 'Criar processo estruturado para gerenciar mudanças e transformações na empresa.',
    category: 'Gestão',
    priority: 'medium',
    min_score: 30,
    max_score: 80,
    checklist: [
      'Definir metodologia de gestão de mudanças',
      'Criar plano de comunicação',
      'Estabelecer processo de treinamento',
      'Implementar acompanhamento e ajustes'
    ]
  },
  {
    code: 'GES-006',
    title: 'Criar processo de inovação contínua',
    description: 'Estabelecer sistema para capturar, avaliar e implementar ideias de melhoria.',
    category: 'Gestão',
    priority: 'medium',
    min_score: 40,
    max_score: 90,
    checklist: [
      'Criar canal de sugestões',
      'Estabelecer comitê de inovação',
      'Definir processo de avaliação',
      'Implementar projetos piloto'
    ]
  },
  {
    code: 'GES-007',
    title: 'Implementar gestão de riscos empresariais',
    description: 'Criar processo de identificação, avaliação e mitigação de riscos organizacionais.',
    category: 'Gestão',
    priority: 'high',
    min_score: 0,
    max_score: 50,
    checklist: [
      'Mapear riscos por área',
      'Avaliar probabilidade e impacto',
      'Criar planos de mitigação',
      'Estabelecer monitoramento contínuo'
    ]
  },
  {
    code: 'GES-008',
    title: 'Criar processo de tomada de decisão estruturada',
    description: 'Estabelecer metodologia para decisões importantes com análise de alternativas.',
    category: 'Gestão',
    priority: 'medium',
    min_score: 30,
    max_score: 80,
    checklist: [
      'Definir critérios de decisão',
      'Criar processo de análise',
      'Estabelecer níveis de aprovação',
      'Implementar registro de decisões'
    ]
  },
  {
    code: 'GES-009',
    title: 'Implementar gestão de conhecimento organizacional',
    description: 'Criar sistema para capturar, organizar e compartilhar conhecimento da empresa.',
    category: 'Gestão',
    priority: 'low',
    min_score: 50,
    max_score: 100,
    checklist: [
      'Criar base de conhecimento',
      'Documentar processos e procedimentos',
      'Estabelecer processo de atualização',
      'Treinar equipe no uso da base'
    ]
  },
  {
    code: 'GES-010',
    title: 'Criar processo de governança e compliance',
    description: 'Estabelecer estrutura de governança e processos de conformidade regulatória.',
    category: 'Gestão',
    priority: 'high',
    min_score: 0,
    max_score: 50,
    checklist: [
      'Mapear requisitos regulatórios',
      'Criar políticas e procedimentos',
      'Estabelecer controles internos',
      'Implementar auditorias periódicas'
    ]
  },
  {
    code: 'GES-011',
    title: 'Implementar cultura de melhoria contínua',
    description: 'Desenvolver ambiente organizacional que estimule busca constante por melhorias.',
    category: 'Gestão',
    priority: 'medium',
    min_score: 30,
    max_score: 80,
    checklist: [
      'Comunicar visão de melhoria contínua',
      'Reconhecer e celebrar melhorias',
      'Criar espaços para compartilhamento',
      'Estabelecer metas de melhoria por área'
    ]
  }
];

/**
 * Executa seed idempotente de recomendações
 */
async function seedRecommendations() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    let inserted = 0;
    let updated = 0;
    
    for (const rec of recommendations) {
      // Verificar se já existe
      const checkResult = await client.query(
        'SELECT id FROM public.recommendations_catalog WHERE code = $1',
        [rec.code]
      );
      
      // Incluir checklist na description de forma estruturada
      const descriptionWithChecklist = `${rec.description}\n\nChecklist:\n${rec.checklist.map((item, idx) => `${idx + 1}. ${item}`).join('\n')}`;
      
      if (checkResult.rows.length > 0) {
        // UPDATE
        await client.query(
          `UPDATE public.recommendations_catalog 
           SET title = $1, description = $2, category = $3, priority = $4, 
               min_score = $5, max_score = $6, is_active = TRUE, updated_at = NOW()
           WHERE code = $7`,
          [
            rec.title,
            descriptionWithChecklist,
            rec.category,
            rec.priority,
            rec.min_score,
            rec.max_score,
            rec.code
          ]
        );
        updated++;
      } else {
        // INSERT
        await client.query(
          `INSERT INTO public.recommendations_catalog 
           (code, title, description, category, priority, min_score, max_score, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)`,
          [
            rec.code,
            rec.title,
            descriptionWithChecklist,
            rec.category,
            rec.priority,
            rec.min_score,
            rec.max_score
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
    await seedRecommendations();
  } catch (error) {
    console.error('Erro fatal:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runSeed();
