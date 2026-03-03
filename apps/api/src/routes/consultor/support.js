const express = require('express');
const router = express.Router();
const { supabase, logConsultorError, auditEvent } = require('./shared');

// GET /consultor/help-requests?status=OPEN — lista pedidos de ajuda (CONSULTOR/ADMIN)
router.get('/help-requests', async (req, res) => {
  try {
    const status = req.query.status || 'OPEN';
    const { data, error } = await supabase
      .schema('public')
      .from('help_requests')
      .select('id, company_id, user_id, context, status, assigned_to, closed_at, created_at, updated_at')
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro GET /consultor/help-requests:', error.message);
      return res.status(500).json({ error: 'Erro ao listar pedidos de ajuda' });
    }
    return res.json({ help_requests: data || [] });
  } catch (err) {
    console.error('Erro GET /consultor/help-requests:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

// GET /consultor/messages?company_id=&user_id=&unread=1 — lista mensagens (CONSULTOR/ADMIN)
router.get('/messages', async (req, res) => {
  try {
    const companyId = req.query.company_id;
    const userId = req.query.user_id;
    const unreadOnly = req.query.unread === '1' || req.query.unread === 'true';

    let query = supabase
      .schema('public')
      .from('support_messages')
      .select('id, company_id, from_user_id, to_user_id, subject, body, created_at, read_at, created_by_role')
      .order('created_at', { ascending: false })
      .limit(100);

    if (companyId) query = query.eq('company_id', companyId);
    if (userId) query = query.or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`);
    if (unreadOnly) query = query.is('read_at', null);

    const { data, error } = await query;

    if (error) {
      console.error('Erro GET /consultor/messages:', error.message);
      return res.status(500).json({ error: 'Erro ao listar mensagens' });
    }

    const list = (data || []).map((m) => ({
      id: m.id,
      company_id: m.company_id,
      from_user_id: m.from_user_id,
      to_user_id: m.to_user_id,
      subject: m.subject,
      body_preview: (m.body || '').slice(0, 120) + ((m.body || '').length > 120 ? '...' : ''),
      created_at: m.created_at,
      read_at: m.read_at,
      created_by_role: m.created_by_role,
    }));

    return res.json({ messages: list });
  } catch (err) {
    console.error('Erro GET /consultor/messages:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

// POST /consultor/messages/reply — CONSULTOR responde mensagem
router.post('/messages/reply', async (req, res) => {
  try {
    const { company_id, to_user_id, body } = req.body;

    if (!company_id || !to_user_id || !body || typeof body !== 'string' || body.trim().length === 0) {
      return res.status(400).json({ error: 'company_id, to_user_id e body são obrigatórios' });
    }

    const { data: company, error: cErr } = await supabase
      .schema('public')
      .from('companies')
      .select('id, owner_user_id')
      .eq('id', company_id)
      .maybeSingle();

    if (cErr || !company) return res.status(404).json({ error: 'Empresa não encontrada' });
    if (company.owner_user_id !== to_user_id) return res.status(403).json({ error: 'Usuário não é dono da empresa' });

    const { data: msg, error: insErr } = await supabase
      .schema('public')
      .from('support_messages')
      .insert({
        company_id,
        from_user_id: req.user.id,
        to_user_id,
        subject: null,
        body: body.trim(),
        created_by_role: req.user.role === 'ADMIN' ? 'ADMIN' : 'CONSULTOR',
      })
      .select()
      .single();

    if (insErr) {
      console.error('Erro POST /consultor/messages/reply:', insErr.message);
      return res.status(500).json({ error: 'Erro ao enviar resposta' });
    }

    return res.status(201).json(msg);
  } catch (err) {
    console.error('Erro POST /consultor/messages/reply:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

// GET /consultor/support/requests?status=OPEN&company_id= — lista pedidos de apoio (CONSULTOR/ADMIN)
router.get('/support/requests', async (req, res) => {
  try {
    const status = req.query.status || 'OPEN';
    const companyId = req.query.company_id;

    let query = supabase
      .schema('public')
      .from('consulting_requests')
      .select('id, company_id, assessment_id, action_id, created_by_user_id, text, status, created_at, updated_at')
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (companyId) query = query.eq('company_id', companyId);

    const { data, error } = await query;

    if (error) {
      console.error('Erro GET /consultor/support/requests:', error.message);
      return res.status(500).json({ error: 'Erro ao listar pedidos de apoio' });
    }
    return res.json({ requests: data || [] });
  } catch (err) {
    console.error('Erro GET /consultor/support/requests:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

// PATCH /consultor/support/requests/:id — CONSULTOR altera status (única escrita permitida)
router.patch('/support/requests/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { status } = req.body;

    if (!status || !['OPEN', 'IN_PROGRESS', 'CLOSED'].includes(status)) {
      return res.status(400).json({ error: 'status deve ser OPEN, IN_PROGRESS ou CLOSED' });
    }

    const { data: existing, error: fetchErr } = await supabase
      .schema('public')
      .from('consulting_requests')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !existing) {
      return res.status(404).json({ error: 'Pedido de apoio não encontrado' });
    }

    const { data: updated, error: updateErr } = await supabase
      .schema('public')
      .from('consulting_requests')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      console.error('Erro PATCH /consultor/support/requests/:id:', updateErr.message);
      return res.status(500).json({ error: 'Erro ao atualizar status' });
    }
    return res.json(updated);
  } catch (err) {
    console.error('Erro PATCH /consultor/support/requests/:id:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

// GET /consultor/support/threads?status=OPEN|CLOSED — lista threads (CONSULTOR/ADMIN)
router.get('/support/threads', async (req, res) => {
  try {
    const status = req.query.status || 'OPEN';
    if (!['OPEN', 'CLOSED'].includes(status)) {
      return res.status(400).json({ error: 'status deve ser OPEN ou CLOSED' });
    }

    const { data: threads, error } = await supabase
      .from('support_threads')
      .select('id, company_id, user_id, status, created_at, closed_at')
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro GET /consultor/support/threads:', error.message);
      return res.status(500).json({ error: 'Erro ao listar threads' });
    }

    return res.json({ threads: threads || [] });
  } catch (err) {
    console.error('Erro GET /consultor/support/threads:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

// GET /consultor/support/threads/:thread_id — lê thread com mensagens (CONSULTOR/ADMIN)
router.get('/support/threads/:thread_id', async (req, res) => {
  try {
    const threadId = req.params.thread_id;

    const { data: thread, error: tErr } = await supabase
      .from('support_threads')
      .select('id, company_id, user_id, status, created_at, closed_at')
      .eq('id', threadId)
      .maybeSingle();

    if (tErr || !thread) {
      return res.status(404).json({ error: 'Thread não encontrado' });
    }

    const { data: messages, error: mErr } = await supabase
      .from('support_thread_messages')
      .select('id, author_user_id, author_role, message, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    if (mErr) {
      console.error('Erro GET /consultor/support/threads/:id:', mErr.message);
      return res.status(500).json({ error: 'Erro ao carregar mensagens' });
    }

    return res.json({
      thread,
      messages: messages || [],
    });
  } catch (err) {
    console.error('Erro GET /consultor/support/threads/:id:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

// POST /consultor/support/threads/:thread_id/close — fecha thread (CONSULTOR/ADMIN)
router.post('/support/threads/:thread_id/close', async (req, res) => {
  try {
    const threadId = req.params.thread_id;

    const { data: existing, error: fetchErr } = await supabase
      .from('support_threads')
      .select('id, status, company_id')
      .eq('id', threadId)
      .maybeSingle();

    if (fetchErr || !existing) {
      return res.status(404).json({ error: 'Thread não encontrado' });
    }
    if (existing.status === 'CLOSED') {
      return res.json({ id: threadId, status: 'CLOSED', message: 'Já estava fechado' });
    }

    const closedAt = new Date().toISOString();
    const { data: updated, error: updateErr } = await supabase
      .from('support_threads')
      .update({ status: 'CLOSED', closed_at: closedAt })
      .eq('id', threadId)
      .select()
      .single();

    if (updateErr) {
      console.error('Erro POST /consultor/support/threads/:id/close:', updateErr.message);
      return res.status(500).json({ error: 'Erro ao fechar thread' });
    }

    await auditEvent({
      actor_user_id: req.user.id,
      actor_role: req.user.role,
      action: 'SUPPORT_THREAD_CLOSE',
      target_type: 'support_thread',
      target_id: threadId,
      company_id: existing.company_id,
      payload: { thread_id: threadId },
    });

    return res.json(updated);
  } catch (err) {
    console.error('Erro POST /consultor/support/threads/:id/close:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

// POST /consultor/help-requests/:id/close — fecha pedido (CONSULTOR/ADMIN)
router.post('/help-requests/:id/close', async (req, res) => {
  try {
    const id = req.params.id;
    const { data: existing, error: fetchErr } = await supabase
      .schema('public')
      .from('help_requests')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !existing) {
      return res.status(404).json({ error: 'Pedido de ajuda não encontrado' });
    }
    if (existing.status === 'CLOSED') {
      return res.json({ id, status: 'CLOSED', message: 'Já estava fechado' });
    }

    const { data: updated, error: updateErr } = await supabase
      .schema('public')
      .from('help_requests')
      .update({ status: 'CLOSED', closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      console.error('Erro POST /consultor/help-requests/:id/close:', updateErr.message);
      return res.status(500).json({ error: 'Erro ao fechar pedido' });
    }
    return res.json(updated);
  } catch (err) {
    console.error('Erro POST /consultor/help-requests/:id/close:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

module.exports = router;
