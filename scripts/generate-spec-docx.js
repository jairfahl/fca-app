/**
 * generate-spec-docx.js
 * Gera arquivos .docx atualizados para as specs com divergências em relação ao código.
 * Uso: node scripts/generate-spec-docx.js
 */

'use strict';

const path = require('path');
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, ShadingType, convertInchesToTwip,
} = require('docx');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const TODAY = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
const GENERATED_NOTE = `Documento gerado automaticamente em ${TODAY} por scripts/generate-spec-docx.js — reconciliação código × spec.`;

// ─── helpers ──────────────────────────────────────────────────────────────────

function h1(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } });
}
function h2(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 } });
}
function h3(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } });
}
function p(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text, ...opts })],
    spacing: { after: 120 },
  });
}
function bold(text) { return p(text, { bold: true }); }
function note(text) {
  return new Paragraph({
    children: [new TextRun({ text: `⚠ ${text}`, bold: true, color: 'C0392B' })],
    spacing: { after: 120 },
    indent: { left: convertInchesToTwip(0.3) },
  });
}
function ok(text) {
  return new Paragraph({
    children: [new TextRun({ text: `✅ ${text}`, color: '27AE60' })],
    spacing: { after: 100 },
    indent: { left: convertInchesToTwip(0.3) },
  });
}
function pending(text) {
  return new Paragraph({
    children: [new TextRun({ text: `⏳ ${text}`, color: 'E67E22' })],
    spacing: { after: 100 },
    indent: { left: convertInchesToTwip(0.3) },
  });
}
function notImpl(text) {
  return new Paragraph({
    children: [new TextRun({ text: `❌ ${text}`, color: 'C0392B' })],
    spacing: { after: 100 },
    indent: { left: convertInchesToTwip(0.3) },
  });
}
function bullet(text) {
  return new Paragraph({
    text,
    bullet: { level: 0 },
    spacing: { after: 80 },
  });
}
function divider() {
  return new Paragraph({ text: '─'.repeat(60), spacing: { before: 200, after: 200 } });
}
function updateBanner(items) {
  const children = [
    new TextRun({ text: 'NOTA DE ATUALIZAÇÃO — DIVERGÊNCIAS CÓDIGO × SPEC', bold: true, size: 24 }),
    new TextRun({ text: '\n' }),
  ];
  items.forEach(item => {
    children.push(new TextRun({ text: `\n• ${item}` }));
  });
  return new Paragraph({
    children,
    spacing: { before: 300, after: 300 },
    indent: { left: convertInchesToTwip(0.3), right: convertInchesToTwip(0.3) },
    shading: { type: ShadingType.CLEAR, fill: 'FFF3CD' },
  });
}

function simpleTable(headers, rows) {
  const headerRow = new TableRow({
    children: headers.map(h =>
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
        shading: { type: ShadingType.CLEAR, fill: '2C3E50' },
        width: { size: Math.floor(9000 / headers.length), type: WidthType.DXA },
      })
    ),
  });
  const dataRows = rows.map(row =>
    new TableRow({
      children: row.map(cell =>
        new TableCell({
          children: [new Paragraph({ text: cell })],
          width: { size: Math.floor(9000 / row.length), type: WidthType.DXA },
        })
      ),
    })
  );
  return new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 9000, type: WidthType.DXA },
  });
}

async function save(filename, sections) {
  const doc = new Document({ sections: [{ children: sections }] });
  const buffer = await Packer.toBuffer(doc);
  const outPath = path.join(DOCS_DIR, filename);
  fs.writeFileSync(outPath, buffer);
  console.log(`✅ ${filename} (${Math.round(buffer.length / 1024)} KB)`);
}

// ─── documents ────────────────────────────────────────────────────────────────

async function fase3() {
  await save('260107_Fase3_Backend_First_NEW.docx', [
    h1('Fase 3 — Back-End First'),
    p('Versão: 2.1 (reconciliada) | Data: março/2026 | Status: Em Progresso'),
    p(GENERATED_NOTE),
    divider(),

    updateBanner([
      'Stack real: JavaScript (CommonJS), NÃO TypeScript — migração planejada para fase futura',
      'ORM: Supabase JS Client (sem Drizzle ORM) — decisão de MVP',
      'Testes API: Jest 30 + Supertest (NÃO Vitest — Vitest exclusivo do frontend/web)',
      '17 test files implementados com mocks Supabase via createChain factory',
    ]),

    h2('1. Objetivo'),
    p('Construir a camada de lógica determinística independente do frontend, garantindo DB como fonte de verdade, fail-closed e auditabilidade completa.'),

    h2('2. Stack real implementada'),
    simpleTable(
      ['Componente', 'Especificado (v2.0)', 'Implementado (real)', 'Status'],
      [
        ['Runtime', 'Node.js 20 LTS', 'Node.js 20 LTS', '✅ Alinhado'],
        ['Framework', 'Express.js 4.x (TypeScript strict)', 'Express.js 4.x (JavaScript CommonJS)', '⚠ Divergente'],
        ['Banco', 'PostgreSQL via Supabase 15+', 'PostgreSQL via Supabase 15+', '✅ Alinhado'],
        ['ORM', 'Drizzle ORM', 'Supabase JS Client (@supabase/supabase-js)', '⚠ Divergente'],
        ['Testes API', 'Vitest (80% cobertura)', 'Jest 30 + Supertest (17 arquivos de teste)', '⚠ Divergente'],
        ['Testes Web', 'Vitest', 'Vitest 1.x', '✅ Alinhado'],
        ['Autenticação', 'Supabase Auth + JWT ES256', 'Supabase Auth + JWT ES256 (jose 5.x)', '✅ Alinhado'],
      ]
    ),

    h2('3. Divergências aprovadas pelo projeto (trade-offs de MVP)'),
    note('TypeScript → JavaScript: Adotou-se JavaScript CommonJS para velocidade de iteração no MVP. A migração para TypeScript está planejada mas não tem prazo definido.'),
    note('Drizzle ORM → Supabase Client: O Supabase JS Client cobre as necessidades atuais. Drizzle adicionaria tipagem mas aumentaria complexidade de setup.'),
    note('Vitest → Jest (API): Jest foi escolhido por melhor integração com o padrão de mocks CommonJS. Vitest permanece no frontend (apps/web).'),

    h2('4. Estrutura do repositório'),
    bullet('apps/api — Business rules, guards, validation, audit, observability (CommonJS)'),
    bullet('apps/web — User experience, workflow orchestration (TypeScript + Next.js 14)'),
    bullet('db/ — Schema, migrations (039 arquivos), seed, validation'),
    bullet('catalogs/full/ — Versioned cause taxonomy, mechanisms, canonical actions'),
    bullet('docs/ — Contracts, architecture decisions, runbooks'),

    h2('5. Endpoints críticos implementados'),
    simpleTable(
      ['Endpoint', 'Método', 'Status'],
      [
        ['GET /ping', 'GET', '✅ Implementado'],
        ['GET /me', 'GET', '✅ Implementado (role from app_metadata)'],
        ['POST /full/assessments/start', 'POST', '✅ Implementado'],
        ['GET /full/assessments/current', 'GET', '✅ Implementado'],
        ['GET /full/catalog', 'GET', '✅ Implementado'],
        ['PUT /full/assessments/:id/answers', 'PUT', '✅ Implementado'],
        ['POST /full/assessments/:id/submit', 'POST', '✅ Implementado'],
        ['GET /full/assessments/:id/results', 'GET', '✅ Implementado'],
        ['POST /full/assessments/:id/plan/select', 'POST', '✅ Implementado'],
        ['POST /full/assessments/:id/plan/:key/evidence', 'POST', '✅ Implementado (write-once)'],
        ['POST /full/assessments/:id/close', 'POST', '✅ Implementado'],
        ['GET /full/reports/:id.pdf', 'GET', '✅ Implementado (PDFKit sync)'],
        ['POST /full/reports/generate', 'POST', '⏳ Exists — BullMQ/Redis a confirmar'],
        ['GET /consultor/*', 'GET', '✅ 20+ endpoints (read-only)'],
        ['GET/POST /admin/*', 'GET/POST', '✅ Implementado (requireAdmin guard)'],
      ]
    ),

    h2('6. Catálogo de erros implementados'),
    simpleTable(
      ['Código', 'HTTP', 'Situação'],
      [
        ['UNAUTHORIZED', '401', '✅'],
        ['FORBIDDEN', '403', '✅'],
        ['DIAG_INCOMPLETE', '400', '✅'],
        ['DIAG_NOT_READY', '400', '✅'],
        ['CYCLE_ALREADY_OPEN', '409', '✅'],
        ['EVIDENCE_REQUIRED', '400', '✅ (P03)'],
        ['EVIDENCE_WRITE_ONCE', '409', '✅ (P03)'],
        ['ENTITLEMENT_REQUIRED', '403', '✅'],
        ['COMPANY_NOT_FOUND', '404', '✅'],
        ['ASSESSMENT_NOT_FOUND', '404', '✅'],
        ['ACTION_NOT_FOUND', '404', '✅'],
        ['LAST_BLOCK_MIN', '400', '✅ (P01)'],
        ['NOT_CLASSIFIED_YET', '200', '✅ (cause engine)'],
      ]
    ),

    h2('7. Testes implementados (17 arquivos)'),
    bullet('negativeContracts.test.js — 8 cenários negativos obrigatórios (Fase 3 spec)'),
    bullet('auditLog.test.js — Audit logging fire-and-forget'),
    bullet('fullEvidenceStatus.test.js — Validação write-once + EVIDENCE_REQUIRED'),
    bullet('fullPdfReport.test.js — Geração de PDF'),
    bullet('fullSnapshotSubmitClose.test.js — Submit + Close workflow'),
    bullet('fullVersionsReports.test.js — Versionamento + reports'),
    bullet('consultorEndpoints.test.js — Acesso transversal CONSULTOR'),
    bullet('meConsultorGuards.test.js — Guards de role e auth'),
    bullet('adminEndpoints.test.js — Gestão admin'),
    bullet('+ 8 outros arquivos de teste de rota e engine'),

    h2('8. Mock pattern canônico (Supabase)'),
    p('Todos os testes usam createChain factory que suporta: schema→from→select→eq→order→maybeSingle→then/catch'),

    h2('9. Middleware stack'),
    bullet('populateAuth — JWKS/ES256 JWT (fails open, nunca rejeita)'),
    bullet('requireAuth — 401 se req.user ausente'),
    bullet('requireFullEntitlement — 403 gate (FULL_TEST_MODE / whitelist / DB)'),
    bullet('blockConsultorOnMutation — 403 para CONSULTOR em writes'),
    bullet('ensureCompanyAccess / ensureConsultantOrOwnerAccess — ownership gate'),

    divider(),
    p(GENERATED_NOTE),
  ]);
}

async function fase4() {
  await save('260107_Fase4_Frontend_MVP_NEW.docx', [
    h1('Fase 4 — Front-End MVP — Fluxo Único'),
    p('Versão: 2.1 (reconciliada) | Data: março/2026 | Status: Em Progresso'),
    p(GENERATED_NOTE),
    divider(),

    updateBanner([
      'Tailwind CSS: NÃO instalado — dívida técnica, formulários usam CSS inline/módulos',
      'React Hook Form + Zod: NÃO instalados — validação manual com useState',
      'Telas: spec original listava 8; implementação real tem 40+ páginas (consultor area + histórico + encerramento + comparar + relatório)',
      'Evidência obrigatória para DONE: ✅ implementado e validado no backend (EVIDENCE_REQUIRED)',
    ]),

    h2('1. Objetivo'),
    p('Interface de usuário para o fluxo linear completo: onboarding → diagnóstico → resultados → plano → execução → encerramento → histórico.'),

    h2('2. Stack real implementada'),
    simpleTable(
      ['Componente', 'Especificado (v2.0)', 'Implementado (real)', 'Status'],
      [
        ['Framework', 'Next.js + TypeScript strict', 'Next.js 14.0.4 + TypeScript 5', '✅ Alinhado'],
        ['React', 'React 18+', 'React 18.2', '✅ Alinhado'],
        ['CSS', 'Tailwind CSS', 'CSS inline + módulos (sem Tailwind)', '❌ Dívida técnica'],
        ['Forms', 'React Hook Form + Zod', 'useState manual', '❌ Dívida técnica'],
        ['Auth', 'Supabase client-side', '@supabase/supabase-js 2.39', '✅ Alinhado'],
        ['Testes', 'Vitest', 'Vitest 1.2', '✅ Alinhado'],
        ['Roteamento', 'Next.js App Router', 'Next.js App Router', '✅ Alinhado'],
      ]
    ),

    note('Tailwind CSS, React Hook Form e Zod aceitos como dívida técnica para o MVP. Os formulários funcionam com validação manual. Refatoração progressiva planejada.'),

    h2('3. Telas implementadas'),
    h3('3.1 Fluxo principal (USER)'),
    simpleTable(
      ['Rota', 'Tela', 'Status'],
      [
        ['/login', 'Login', '✅'],
        ['/onboarding', 'Onboarding + LGPD consent checkbox', '✅ (+LGPD P06)'],
        ['/full/wizard', 'Wizard diagnóstico (progress bar + debounce 800ms)', '✅'],
        ['/full/resultados', 'Resultados six-pack (3 vazamentos + 3 alavancas)', '✅'],
        ['/full/acoes', 'Seleção de ações (3 por bloco; 1-2 no último)', '✅'],
        ['/full/dashboard', 'Dashboard progresso do plano', '✅'],
        ['/full/encerramento', 'Encerramento do ciclo + score + CTA novo diagnóstico', '✅ (P08)'],
        ['/full/historico', 'Histórico de versões + download PDF', '✅ (P08)'],
        ['/full/comparar', 'Comparação versão N vs N-1', '✅'],
        ['/full/relatorio', 'Visualizador de relatório', '✅'],
        ['/paywall', 'Paywall / CTA upgrade', '✅'],
      ]
    ),

    h3('3.2 Área do consultor (CONSULTOR/ADMIN)'),
    simpleTable(
      ['Rota', 'Tela', 'Status'],
      [
        ['/consultor', 'Home consultor (lista de empresas)', '✅'],
        ['/consultor/companies', 'Lista de empresas transversal', '✅'],
        ['/consultor/companies/:id', 'Visão de empresa', '✅'],
        ['/consultor/companies/:id/diagnostics/:aId', 'Assessment detail', '✅'],
        ['/consultor/company/:id/overview', 'Overview empresa', '✅'],
        ['/consultor/company/:id/historico', 'Histórico versões (consultor)', '✅'],
        ['/consultor/company/:id/relatorio', 'Relatório (consultor)', '✅'],
        ['/consultor/messages', 'Inbox mensagens', '✅'],
        ['/consultor/messages/:threadId', 'Thread de mensagem', '✅'],
      ]
    ),

    h2('4. Comportamentos implementados'),
    ok('Progress bar animada no wizard (width % baseado em answered/total, transition 0.3s)'),
    ok('Debounce de 800ms para auto-save no wizard'),
    ok('data-testid="btn-concluir-diagnostico" no botão de submit do wizard'),
    ok('Botão desabilitado até completar todas as perguntas + durante saving/submitting'),
    ok('LGPD checkbox obrigatório no onboarding (botão desabilitado até aceite)'),
    ok('Evidência obrigatória para marcar ação como DONE (validado no backend)'),
    ok('RoleGate isomórfico — sem loop de redirect (P07)'),
    ok('fetchMe deduplica requisições in-flight (evita race condition)'),

    h2('5. Componentes reutilizáveis'),
    bullet('RoleGate — controle de visibilidade por role'),
    bullet('ProtectedRoute — guard de autenticação'),
    bullet('ConsultorBlock — badge/info do consultor'),
    bullet('ConsultorBreadcrumb — navegação da área consultor'),
    bullet('PedirAjudaConsultor — solicitar ajuda ao consultor'),
    bullet('PedirApoioButton — botão de apoio'),
    bullet('PaywallModal — modal de upgrade'),

    h2('6. Estados globais implementados'),
    ok('Loading state (saving / submitting flags)'),
    ok('API error (apiFetch lança ApiError; UI trata via try/catch)'),
    ok('401 auto-redirect para /login'),
    ok('Session management via Supabase client-side'),
    pending('Toast de sucesso — implementação parcial (sem biblioteca de toast)'),
    pending('Overlay de sessão expirada — auth.tsx redireciona mas sem overlay visual'),

    h2('7. Dívida técnica aprovada para MVP'),
    notImpl('Tailwind CSS — formulários usam CSS inline'),
    notImpl('React Hook Form — validação manual com useState'),
    notImpl('Zod — sem schema validation no frontend'),
    notImpl('Push notifications'),
    notImpl('PWA / offline support'),
    notImpl('i18n / multi-idioma'),

    divider(),
    p(GENERATED_NOTE),
  ]);
}

async function fase5() {
  await save('260107_Fase5_Ciclo_de_Mentoria_NEW.docx', [
    h1('Fase 5 — Ciclo de Mentoria'),
    p('Versão: 2.1 (reconciliada) | Data: março/2026 | Status: Em Progresso'),
    p(GENERATED_NOTE),
    divider(),

    updateBanner([
      'SLA de resposta: NÃO implementado — sem rastreamento de prazo, sem notificações de email',
      'Comentário do consultor: estrutura parcial — tabela consultant_comments não confirmada em schema',
      'Portal do consultor: ✅ rotas /consultor/* implementadas com 20+ endpoints',
      'Help requests: ✅ migration 022 + rota helpRequests.js implementados',
    ]),

    h2('1. Objetivo'),
    p('Transformar usuários em clientes por entrega de valor real baseada em execução, evidência e evolução de maturidade. A mentoria humana usa dados concretos do app como base para orientação do consultor.'),

    h2('2. Evidência por ação — status de implementação'),
    ok('Tipos: NOTE (texto até 2000 chars), FILE (referência de anexo), LINK (URL validada)'),
    ok('Evidência OBRIGATÓRIA para marcar ação como DONE (EVIDENCE_REQUIRED 400)'),
    ok('Status DROPPED exige justificativa textual (drop_reason, mínimo 20 chars)'),
    ok('Write-once — tentativa de sobrescrever retorna 409 EVIDENCE_WRITE_ONCE'),
    ok('Persistida exclusivamente no banco (full_action_evidence table)'),

    h2('3. Comentário do consultor — status de implementação'),
    pending('Tabela consultant_comments: não confirmada em migrations; estrutura planejada mas não verificada no schema atual'),
    pending('Feedback estruturado por ação: rota /consultor/acoes/:id/comentar existe mas implementação de persistência a verificar'),
    ok('Write-once por design (mesmo padrão de evidência)'),
    ok('Mínimo 20 chars, máximo 2000 chars — validação prevista no backend'),

    h2('4. SLA de mentoria — NÃO IMPLEMENTADO'),
    notImpl('Rastreamento de prazo para resposta a help requests (48h úteis)'),
    notImpl('Notificação de email ao consultor em nova solicitação'),
    notImpl('Alerta ao ADMIN após 72h sem resposta'),
    notImpl('SLA para comentário em ação DONE (5 dias úteis)'),
    notImpl('Notificação diária de pendências ao consultor'),
    notImpl('Alerta ao ADMIN após 7 dias sem comentário'),
    p('Nota: A infraestrutura de email (Resend) não está integrada. SLA é planejado para iteração futura.'),

    h2('5. Help Request — status de implementação'),
    ok('migration 022 — tabela help_requests com: id, company_id, assessment_id, gap_description, status, assigned_to, created_at, resolved_at'),
    ok('Status: OPEN / IN_PROGRESS / RESOLVED'),
    ok('Rota GET /consultor/help-requests — lista de pendências'),
    ok('Rota POST /consultor/help-requests/:id/close — encerramento'),
    ok('Rota GET /consultor/help-requests/:id — detalhe'),
    pending('Atribuição automática de consultor (assigned_to): preenchimento manual'),

    h2('6. Portal do Consultor — rotas implementadas'),
    simpleTable(
      ['Rota', 'Propósito', 'Status'],
      [
        ['GET /consultor/companies', 'Lista de empresas (transversal)', '✅'],
        ['GET /consultor/companies/:id/diagnostics', 'Diagnósticos da empresa', '✅'],
        ['GET /consultor/company/:id/overview', 'Overview + último assessment', '✅'],
        ['GET /consultor/company/:id/actions', 'Ações FULL + LIGHT', '✅'],
        ['GET /consultor/help-requests', 'Fila de help requests', '✅'],
        ['GET /consultor/messages', 'Inbox de mensagens', '✅'],
        ['POST /consultor/messages/reply', 'Responder mensagem', '✅'],
        ['GET /consultor/support/threads', 'Threads de suporte', '✅'],
        ['POST /consultor/support/threads/:id/close', 'Fechar thread', '✅'],
      ]
    ),
    ok('Acesso restrito a CONSULTOR e ADMIN (requireConsultorOrAdmin middleware)'),
    ok('Todos os acessos auditados via logConsultorAccess(req)'),

    h2('7. Histórico de ciclos — status'),
    ok('Cada assessment tem full_version (migration 027) e assessment_version (migration 037)'),
    ok('Assessments anteriores (SUBMITTED/CLOSED) preservados e acessíveis em /full/historico'),
    ok('Comparação versão N vs N-1 em /full/comparar'),
    pending('Δscore por processo entre ciclos: UI disponível, cálculo a validar'),

    h2('8. Mecanismo de conversão'),
    p('O consultor acessa diagnóstico, evidências e histórico via portal. O CTA "Solicitar apoio" está implementado no frontend (PedirAjudaConsultor, PedirApoioButton). Conversão para plano pago via PaywallModal.'),

    divider(),
    p(GENERATED_NOTE),
  ]);
}

async function fase6(filename) {
  await save(filename, [
    h1('Fase 6 — Monetização'),
    p('Versão: 2.1 (reconciliada) | Data: março/2026 | Status: Em Progresso'),
    p(GENERATED_NOTE),
    divider(),

    updateBanner([
      'Schema de subscriptions: ✅ migration 038 implementada (FREE/PRO/CONSULTORIA + todos os campos)',
      'Gateway de pagamento (Stripe/Pagar.me): ❌ NÃO integrado — sem webhook handlers',
      'Trial e grace period: ✅ campos existem no schema; ❌ lógica de expiração automática pendente',
      'Entitlement guards: ✅ requireFullEntitlement implementado com fail-closed',
    ]),

    h2('1. Objetivo'),
    p('Modelo de subscriptions, controle de acesso por plano e integração com gateway de pagamento.'),

    h2('2. Princípios estruturais — status'),
    ok('Monetização não altera o core — diagnóstico e score funcionam independente do plano'),
    ok('Pagamento controla acesso — lógica consulta apenas STATUS da subscription'),
    ok('Lógica centralizada — requireFullEntitlement em middleware único'),
    ok('Fail-closed — sem permissão explícita, acesso bloqueado com erro contratual'),
    ok('Dados persistem — cancelamento não deleta dados'),

    h2('3. Planos disponíveis — spec vs implementação'),
    simpleTable(
      ['Feature', 'FREE', 'PRO', 'CONSULTORIA', 'Status no schema'],
      [
        ['Ciclos FULL', '1', 'Ilimitados', 'Ilimitados', '✅ via entitlement'],
        ['PDF reports', '1', 'Ilimitados', 'Ilimitados', '⏳ guard a implementar'],
        ['Histórico diagnóstico', '1', 'Ilimitados', 'Ilimitados', '⏳ guard a implementar'],
        ['Portal consultor', 'Não', 'Não', 'Sim', '✅ CONSULTORIA role'],
        ['Mentoring cycle', 'Não', 'Sim', 'Sim', '⏳ SLA não implementado'],
        ['Multi-empresa', 'Não', 'Não', 'Sim', '✅ CONSULTOR role'],
      ]
    ),

    h2('4. Schema de subscriptions — migration 038'),
    ok('Tabela: public.subscriptions (1 por empresa, UNIQUE company_id)'),
    ok('Planos: FREE, PRO, CONSULTORIA (ENUM)'),
    ok('Status: TRIAL, ACTIVE, INACTIVE, PAST_DUE, CANCELLED (ENUM)'),
    ok('Campos: trial_ends_at, current_period_start, current_period_end, grace_period_ends_at'),
    ok('Gateway fields: gateway_subscription_id, gateway_customer_id'),
    ok('Lifecycle: cancelled_at, created_at, updated_at'),
    ok('RLS: apenas owner lê sua subscription; writes via service role'),

    h2('5. Trial e grace period'),
    simpleTable(
      ['Situação', 'Status', 'Acesso', 'Implementado?'],
      [
        ['Nova conta', 'TRIAL', 'Pro (todos features)', '⏳ campos prontos, lógica pendente'],
        ['Trial expirado sem pagamento', 'INACTIVE', 'Apenas FREE', '⏳ job de verificação pendente'],
        ['Falha de pagamento', 'PAST_DUE', 'Manutenção em grace', '⏳ webhook pendente'],
        ['Grace expirado', 'INACTIVE', 'Apenas FREE', '⏳ job pendente'],
        ['Cancelado', 'CANCELLED', 'Read-only dos dados', '⏳ lógica pendente'],
        ['Reativação', 'ACTIVE', 'Restaura plano', '⏳ webhook pendente'],
      ]
    ),

    h2('6. Gateway de pagamento — NÃO INTEGRADO'),
    notImpl('Stripe SDK — não instalado'),
    notImpl('Pagar.me SDK — não instalado'),
    notImpl('Webhook handler para checkout.session.completed'),
    notImpl('Webhook handler para invoice.payment_failed'),
    notImpl('Webhook handler para customer.subscription.deleted'),
    notImpl('Job de expiração de trial (cron)'),
    notImpl('Job de expiração de grace period (cron)'),
    p('Nota: O schema está pronto para receber dados do gateway via webhooks. A integração é planejada para iteração pós-MVP.'),

    h2('7. Entitlement guards implementados'),
    ok('requireFullEntitlement middleware: verifica FULL_TEST_MODE env → whitelist → DB entitlement'),
    ok('blockConsultorOnMutation: CONSULTOR não pode escrever em assessments'),
    ok('requireConsultorOrAdmin: portal do consultor restrito'),
    ok('requireAdmin: rotas /admin/* restritas'),
    pending('Guard por plano (FREE/PRO/CONSULTORIA) em endpoints específicos: a implementar após integração do gateway'),

    h2('8. Próximos passos'),
    bullet('Integrar Stripe ou Pagar.me (webhooks)'),
    bullet('Implementar job de verificação de trial_ends_at e grace_period_ends_at'),
    bullet('Adicionar guards por plano nos endpoints de PDF e histórico'),
    bullet('Implementar lógica de reativação pós-cancelamento'),

    divider(),
    p(GENERATED_NOTE),
  ]);
}

async function fase7() {
  await save('260218_Fase7_Relatorios_NEW.docx', [
    h1('Fase 7 — Relatórios'),
    p('Versão: 2.1 (reconciliada) | Data: março/2026 | Status: Em Progresso'),
    p(GENERATED_NOTE),
    divider(),

    updateBanner([
      'Biblioteca: PDFKit implementado (NÃO Puppeteer — Puppeteer movido para alternativa futura)',
      'Geração assíncrona: endpoint POST /full/reports/generate existe; BullMQ/Redis não confirmados',
      'Versionamento: assessment_version (migration 037) ✅; coexiste com full_version (migration 027) — duplicidade a resolver',
      'Critérios de aceite: 5 de 7 implementados; 2 pendentes de verificação',
    ]),

    h2('1. Escopo implementado'),
    ok('Geração de PDF FULL (download) com diagnóstico, recomendações e plano'),
    ok('Versionamento de diagnóstico FULL por empresa (assessment_version)'),
    ok('Tela /full/historico — download de relatório + histórico de versões'),
    ok('Tela /full/relatorio — visualizador de relatório'),
    ok('Controles de acesso: USER, CONSULTOR, ADMIN'),
    ok('DB como fonte de verdade — sem dependência de storage para texto'),
    pending('Geração assíncrona via fila (POST /full/reports/generate) — endpoint existe; queue backend a verificar'),
    notImpl('Envio automático por email'),
    notImpl('Assinatura digital / timestamp qualificado'),

    h2('2. Biblioteca de geração — decisão implementada'),
    simpleTable(
      ['Biblioteca', 'Especificado (v2.0)', 'Status real'],
      [
        ['Puppeteer (HTML→PDF)', '1ª opção', '❌ Não utilizado — overhead de runtime'],
        ['PDFKit', 'Alternativa', '✅ IMPLEMENTADO (pdfkit ^0.17.2)'],
        ['jsPDF', 'Não recomendado', '❌ Não utilizado'],
      ]
    ),
    p('PDFKit foi escolhido por menor overhead e geração programática. O output é funcional mas sem o layout visual complexo que Puppeteer permitiria. Puppeteer permanece como opção para iteração futura caso o layout do PDF precise ser mais rico.'),

    h2('3. Arquitetura de geração'),
    h3('3.1 Fluxo síncrono (implementado)'),
    ok('GET /full/reports/:assessment_id.pdf → backend gera → retorna PDF inline (Content-Type: application/pdf)'),
    ok('Implementado em apps/api/src/lib/fullReportPdf.js (158 linhas, PDFKit)'),
    ok('Dados: full_process_scores + full_findings + full_selected_actions + full_action_evidence'),

    h3('3.2 Fluxo assíncrono (parcial)'),
    pending('POST /full/reports/generate — endpoint existe em routes/full.js'),
    pending('BullMQ + Redis: não confirmado — verificar se há worker real ou apenas stub'),
    pending('GET /full/reports/jobs/:job_id — status do job'),
    pending('Polling frontend a cada 3s por até 60s'),

    h2('4. Controle de acesso e elegibilidade'),
    simpleTable(
      ['Condição', 'Resultado', 'Implementado?'],
      [
        ['assessment.status = DRAFT', '400 DIAG_NOT_READY', '✅'],
        ['assessment.status = SUBMITTED ou CLOSED', '200 — PDF gerado', '✅'],
        ['USER sem vínculo com company', '403 FORBIDDEN', '✅'],
        ['CONSULTOR vinculado à empresa', '200 + audit event', '✅'],
        ['ADMIN', '200 — acesso total', '✅'],
      ]
    ),

    h2('5. Conteúdo obrigatório do relatório — status'),
    ok('Capa: company, data, versão do diagnóstico, responsável'),
    ok('Diagnóstico por processo: perguntas + respostas + score calculado'),
    ok('Recomendações e plano de 30 dias: ações selecionadas + DoD'),
    ok('Execução, evidência e resultados: status de cada ação + evidência write-once'),
    pending('Causas e mecanismos (quando Cause Engine ativo): a verificar geração condicional'),
    pending('Rodapé de governança: company_id, assessment_id, versão do catálogo — a verificar'),
    ok('Evento de auditoria report_generated após geração'),

    h2('6. Versionamento de diagnóstico'),
    simpleTable(
      ['Regra', 'Detalhe', 'Status'],
      [
        ['Versão = 1', 'Primeiro FULL SUBMITTED da empresa', '✅ assessment_version DEFAULT 1'],
        ['Versão N+1', 'Nova execução FULL → versão incrementada no SUBMIT', '✅ migration 037'],
        ['Histórico imutável', 'Versões anteriores (SUBMITTED/CLOSED) não sobrescritas', '✅'],
        ['Duplicidade full_version / assessment_version', 'migration 027 (full_version) + migration 037 (assessment_version)', '⚠ A resolver: escolher campo canônico'],
      ]
    ),
    note('Duplicidade: full_version (migration 027) e assessment_version (migration 037) têm a mesma semântica. Recomenda-se deprecar assessment_version e usar full_version como canônico, ou o inverso — decisão pendente.'),

    h2('7. Critérios de aceite — status por critério'),
    simpleTable(
      ['#', 'Critério', 'Status'],
      [
        ['1', 'Assessment SUBMITTED → PDF válido com cover + diagnóstico + IDs de rastreamento', '✅'],
        ['2', 'Assessment DRAFT → 400 DIAG_NOT_READY com mensagem de orientação', '✅'],
        ['3', 'Todas as ações concluídas → mensagem de encerramento + CTA novo diagnóstico', '✅ (/full/encerramento)'],
        ['4', 'Novo diagnóstico após encerramento → versão N+1 em DRAFT; versão N preservada', '✅'],
        ['5', 'USER sem vínculo com company → 403 FORBIDDEN', '✅'],
        ['6', 'CONSULTOR vinculado → 200 PDF + audit event registrado', '✅'],
        ['7', 'Relatório solicitado 2× sem mudança de dados → mesmo conteúdo (idempotência)', '⏳ a verificar'],
      ]
    ),

    divider(),
    p(GENERATED_NOTE),
  ]);
}

async function blueprintV13() {
  await save('260218_Blueprint_Final_v1.3_CODEX.docx', [
    h1('Blueprint do Produto e Arquitetura v1.3_CODEX'),
    p('Versão: 1.4 (reconciliada) | Data: março/2026 | Status: Aprovado — itens de backlog resolvidos'),
    p(GENERATED_NOTE),
    divider(),

    updateBanner([
      'Backlog imediato: todos os 6 itens P0-P6 resolvidos via prompts P01-P11 (março/2026)',
      'Roadmap: Fase 1 (0-30 dias) CONCLUÍDA; Fase 2 (31-60 dias) PARCIAL; Fase 3 (61-90 dias) PARCIAL',
      'Deployment: infraestrutura (CI/CD, Sentry, Grafana, BullMQ/Redis) ainda não configurada',
    ]),

    h2('1. Objetivo'),
    p('Consolidar a especificação funcional e técnica do FCA-MTR em contrato operacional sem ambiguidade, com critérios de aceite, governança, observabilidade e controles de risco para LIGHT e FULL.'),

    h2('2. Backlog imediato — status atualizado (março/2026)'),
    simpleTable(
      ['#', 'Item', 'Status (original)', 'Status (atual)'],
      [
        ['1', 'Eliminar 500 conhecidos → erro contratual com código estável', 'Pendente', '✅ RESOLVIDO (P03/P04)'],
        ['2', 'Garantir current(for_wizard=1) cria DRAFT após CLOSED', 'Pendente', '✅ RESOLVIDO'],
        ['3', 'Garantir ativação de teste FULL sem falso 403', 'Pendente', '✅ RESOLVIDO (requireFullEntitlement)'],
        ['4', 'Permitir último bloco com 1-2 ações sem quebra de contrato', 'Pendente', '✅ RESOLVIDO (P01 — Math.min(3,remaining))'],
        ['5', 'Garantir leitura pós-ciclo para USER e CONSULTOR por permissão', 'Pendente', '✅ RESOLVIDO (P05 + guards)'],
        ['6', 'Fechar segregação portal/rotas do consultor', 'Pendente', '✅ RESOLVIDO (P05 + requireConsultorOrAdmin)'],
      ]
    ),

    h2('3. Roadmap 90 dias — status atualizado'),
    h3('Fase 1 (0-30 dias): FULL hardening + contratos de erro + testes de regressão'),
    ok('FULL hardening: P01-P11 aplicados (score, evidência, LGPD, versioning, audit, PDF, subscriptions, encerramento)'),
    ok('Contratos de erro: 13+ códigos implementados'),
    ok('Testes de regressão: 17 arquivos de teste (negativeContracts, auditLog, fullEvidenceStatus, etc.)'),

    h3('Fase 2 (31-60 dias): Segregação consultor + help_request com SLA'),
    ok('Segregação consultor: /consultor/* implementado com requireConsultorOrAdmin'),
    ok('Help requests: migration 022 + rotas implementadas'),
    notImpl('SLA de resposta (48h) com notificações de email'),
    notImpl('Integração Resend para emails transacionais'),

    h3('Fase 3 (61-90 dias): Cause Engine MVP estabilizado + métricas ROI'),
    ok('Cause Engine MVP: migrations 023-024, lógica de classificação implementada'),
    ok('6 classes de causa implementadas (GOVERNANCE, RITUAL, DATA, ACCOUNTABILITY, CAPABILITY, INCENTIVES)'),
    pending('Métricas ROI: logEvent() implementado para 5 eventos; dashboards Sentry/Grafana não configurados'),
    notImpl('taxa_ciclos_com_ganho, tempo_submit_para_plano — KPIs não instrumentados como métricas'),

    h2('4. Princípios não-negociáveis — todos mantidos'),
    ok('Determinismo: lógica de negócio no backend'),
    ok('DB-first: banco como fonte de verdade'),
    ok('Evidence write-once: 409 EVIDENCE_WRITE_ONCE implementado'),
    ok('Fail-closed: ausência de permissão → bloqueia com erro contratual'),
    ok('Catálogo canônico versionado: catalog.v1.json sob controle de versão'),
    ok('Auditabilidade end-to-end: logEvent() com actor_id, company_id, assessment_id, timestamp'),

    h2('5. Profiles e segregação — implementados'),
    simpleTable(
      ['Profile', 'Escopo', 'Status'],
      [
        ['USER', 'Empresa própria apenas', '✅'],
        ['CONSULTOR', 'Empresas autorizadas (read-only)', '✅'],
        ['ADMIN', 'Acesso total + modo de teste', '✅'],
      ]
    ),

    h2('6. Entitlements — implementados'),
    ok('requireFullEntitlement middleware: FULL_TEST_MODE → whitelist → DB entitlement'),
    ok('Fail-closed por padrão'),
    ok('POST /entitlements/full/activate_test (apenas ADMIN)'),
    pending('Entitlement por plano PRO/CONSULTORIA via subscription.status — dependente de gateway'),

    h2('7. Segurança e compliance — status'),
    ok('PII masking em logs (sem dados sensíveis em meta do audit_log)'),
    ok('company_id segregation em todas as queries de negócio'),
    ok('LGPD consent: migration 036 + lgpd_accepted_at + checkbox no onboarding'),
    pending('trace_id em todos os erros e audits: parcialmente implementado'),
    notImpl('Vault para secrets/tokens (usando env vars)'),

    h2('8. Observabilidade — status'),
    ok('5 eventos auditados: cause_classified, plan_created, evidence_recorded, gain_declared, report_generated'),
    ok('logEvent() fire-and-forget com try/catch isolado'),
    notImpl('Sentry (error tracking) — não integrado'),
    notImpl('Grafana (metrics dashboards) — não configurado'),
    notImpl('SLA alerts (p95 latência, taxa_erro_500)'),

    divider(),
    p(GENERATED_NOTE),
  ]);
}

async function blueprintV20() {
  await save('260218_Blueprint_Final_v2_0_NEW.docx', [
    h1('Blueprint do Produto e Arquitetura v2.0'),
    p('Versão: 2.1 (reconciliada) | Data: março/2026 | Status: Aprovado — atualizado com estado real do código'),
    p(GENERATED_NOTE),
    divider(),

    updateBanner([
      'Hardening backlog (8 itens): todos resolvidos via prompts P01-P11 (março/2026)',
      'Infraestrutura de deploy: Railway/Render/Vercel/Sentry/Grafana/BullMQ/Redis/CI-CD — NÃO configurados',
      'Observabilidade: logEvent() para 5 eventos ✅; Sentry/Grafana ❌',
      'Subscriptions: schema completo (migration 038) ✅; gateway integration ❌',
    ]),

    h2('1. Visão do produto'),
    p('App para PMEs: diagnosticar → priorizar → executar → evidenciar → declarar ganho → fechar ciclo. Dois módulos: LIGHT (gratuito) e FULL (PRO/CONSULTORIA).'),

    h2('2. Guardrails — todos mantidos'),
    ok('Determinismo: lógica no backend'),
    ok('DB como fonte de verdade'),
    ok('Fail-closed'),
    ok('Catálogo canônico versionado'),
    ok('Audit event-based com actor_id, company_id, assessment_id, timestamp'),
    ok('Segregação de roles'),

    h2('3. Arquitetura de deployment — planejado vs real'),
    simpleTable(
      ['Componente', 'Planejado', 'Status real'],
      [
        ['API', 'Railway ou Render (Docker)', '❌ Não configurado — roda local'],
        ['Frontend', 'Vercel (Next.js CDN)', '❌ Não configurado'],
        ['Database', 'Supabase (PostgreSQL + Auth + RLS)', '✅ Configurado'],
        ['Storage', 'Supabase Storage (evidências)', '⏳ Parcial'],
        ['Email transacional', 'Resend', '❌ Não integrado'],
        ['Jobs/Queue', 'BullMQ + Redis', '❌ Não confirmado'],
        ['Error tracking', 'Sentry', '❌ Não integrado'],
        ['Metrics', 'Grafana', '❌ Não configurado'],
        ['CI/CD', 'GitHub Actions', '❌ Não configurado'],
      ]
    ),

    h2('4. Roles e segregação — implementados'),
    ok('USER: scope da empresa própria'),
    ok('CONSULTOR: multi-empresa autorizado (read-only via requireConsultorOrAdmin)'),
    ok('ADMIN: acesso total + modo de teste'),
    ok('role vem do JWT (app_metadata.role primário; user_metadata.role fallback)'),
    ok('GET /me retorna: user_id, email, role, company_id_ativa'),

    h2('5. Cause Engine MVP — implementado'),
    ok('6 classes de causa: CAUSE_GOVERNANCE, CAUSE_RITUAL, CAUSE_DATA, CAUSE_ACCOUNTABILITY, CAUSE_CAPABILITY, CAUSE_INCENTIVES'),
    ok('3-5 perguntas objetivas por gap (sem campo aberto no MVP)'),
    ok('Classificação determinística e versionada (migrations 023-024)'),
    ok('NOT_CLASSIFIED_YET para casos não cobertos'),
    ok('Respostas armazenadas como suporte à causa (rastreabilidade)'),

    h2('6. Hardening backlog original — status atualizado'),
    simpleTable(
      ['Item', 'Descrição', 'Resolvido?'],
      [
        ['FULL activation', 'Ativação FULL sem falso 403', '✅ P01-P11'],
        ['Findings errors', 'Errors de findings → contratos', '✅ P03'],
        ['Wizard DRAFT creation', 'current(for_wizard=1) cria DRAFT', '✅'],
        ['Last block 1-2 actions', 'Math.min(3, remaining_count)', '✅ P01'],
        ['LGPD consent', 'lgpd_accepted_at + checkbox', '✅ P06'],
        ['Score 0-100', 'toExternalScore() em todos os pontos', '✅ P02'],
        ['Evidence enforcement', 'EVIDENCE_REQUIRED + WRITE_ONCE', '✅ P03'],
        ['Audit log 3 camadas', 'auditLog.js + audit.js + consultorAudit.js', '✅ P11'],
      ]
    ),

    h2('7. Observabilidade — status atual'),
    ok('cause_classified — logEvent() implementado'),
    ok('plan_created — logEvent() implementado'),
    ok('evidence_recorded — logEvent() implementado'),
    ok('gain_declared — logEvent() implementado'),
    ok('report_generated — logEvent() implementado'),
    notImpl('Sentry SDK — não instalado'),
    notImpl('Grafana dashboards — não configurados'),
    notImpl('SLA alerts (p95 latência por endpoint)'),
    notImpl('taxa_erro_500 e taxa_erro_contratual — não instrumentadas como métricas exportáveis'),

    h2('8. Subscriptions — status'),
    ok('Tabela subscriptions implementada (migration 038)'),
    ok('Planos: FREE, PRO, CONSULTORIA'),
    ok('Status: TRIAL, ACTIVE, INACTIVE, PAST_DUE, CANCELLED'),
    ok('Campos de trial e grace period presentes'),
    notImpl('Stripe / Pagar.me — não integrados'),
    notImpl('Webhook handlers — não implementados'),
    notImpl('Jobs de expiração automática — não implementados'),

    h2('9. Roadmap — estado atual'),
    h3('Fase 1 (0-30 dias) ✅ CONCLUÍDA'),
    p('FULL hardening completo via P01-P11. 139 arquivos alterados, 14.452 inserções. Todos os contratos de erro implementados. 17 test files cobrindo cenários negativos e positivos.'),

    h3('Fase 2 (31-60 dias) — Em Progresso'),
    ok('Segregação consultor: /consultor/* com guards implementados'),
    ok('Help requests: migration 022 + rotas'),
    notImpl('SLA e notificações de email'),
    notImpl('Integração Resend'),

    h3('Fase 3 (61-90 dias) — Em Progresso'),
    ok('Cause Engine MVP estabilizado'),
    pending('ROI metrics: eventos auditados; dashboards não configurados'),

    h3('Próximos passos (além dos 90 dias)'),
    bullet('Configurar Railway/Render para deploy da API'),
    bullet('Configurar Vercel para deploy do frontend'),
    bullet('Integrar Sentry para error tracking'),
    bullet('Configurar GitHub Actions para CI/CD'),
    bullet('Integrar Stripe ou Pagar.me para pagamentos'),
    bullet('Implementar BullMQ + Redis para jobs assíncronos de PDF'),
    bullet('Configurar Grafana para métricas de negócio'),

    divider(),
    p(GENERATED_NOTE),
  ]);
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Gerando arquivos .docx atualizados...\n');
  await Promise.all([
    fase3(),
    fase4(),
    fase5(),
    fase6('260107_Fase6_Monetizacao_NEW.docx'),
    fase6('260107_Fase6_Monetizacao_NEW_1.docx'),
    fase7(),
    blueprintV13(),
    blueprintV20(),
  ]);
  console.log('\nConcluído. Arquivos salvos em docs/');
}

main().catch(err => { console.error(err); process.exit(1); });
