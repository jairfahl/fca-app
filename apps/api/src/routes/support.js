/**
 * POST /support/request — USER cria pedido de apoio (consulting_requests)
 * POST /support/threads — USER abre thread (idempotente)
 * POST /support/threads/:thread_id/messages — USER/CONSULTOR/ADMIN envia mensagem
 */
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/requireAuth');
const { blockConsultorOnMutation } = require('../middleware/requireRole');
const { requireAnyRole } = require('../middleware/guards');
const { ensureCompanyAccess } = require('../lib/companyAccess');
const { supabase } = require('../lib/supabase');
const { auditEvent } = require('../lib/audit');

router.post('/support/request', requireAuth, blockConsultorOnMutation, async (req, res) => {
  try {
    const userId = req.user.id;
    const { company_id, assessment_id, action_id, text } = req.body;

    if (!company_id || !text || typeof text !== 'string') {
      return res.status(400).json({ error: 'company_id e text são obrigatórios' });
    }

    const company = await ensureCompanyAccess(userId, company_id);
    if (!company) {
      return res.status(403).json({ error: 'Sem acesso a esta empresa' });
    }

    const { data, error } = await supabase
      .schema('public')
      .from('consulting_requests')
      .insert({
        company_id,
        assessment_id: assessment_id || null,
        action_id: action_id || null,
        created_by_user_id: userId,
        text: text.trim(),
        status: 'OPEN',
      })
      .select()
      .single();

    if (error) {
      console.error('Erro POST /support/request:', error.message);
      return res.status(500).json({ error: 'Erro ao criar pedido de apoio' });
    }
    return res.status(201).json(data);
  } catch (err) {
    console.error('Erro POST /support/request:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

// POST /support/threads — USER/ADMIN (idempotente). CONSULTOR não cria thread.
router.post('/support/threads', requireAuth, blockConsultorOnMutation, async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role || 'USER';
    const { company_id } = req.body;

    if (!company_id || typeof company_id !== 'string') {
      return res.status(400).json({ error: 'company_id é obrigatório' });
    }

    const { data: company, error: cErr } = await supabase
      .from('companies')
      .select('id, owner_user_id')
      .eq('id', company_id.trim())
      .maybeSingle();

    if (cErr || !company) {
      return res.status(404).json({ error: 'Empresa não encontrada' });
    }
    if (company.owner_user_id !== userId && role !== 'ADMIN') {
      return res.status(403).json({ error: 'Empresa não pertence ao usuário' });
    }

    const { data: existing } = await supabase
      .from('support_threads')
      .select('id, company_id, user_id, status, created_at')
      .eq('company_id', company_id.trim())
      .eq('user_id', userId)
      .eq('status', 'OPEN')
      .maybeSingle();

    if (existing) {
      return res.status(200).json(existing);
    }

    const { data: thread, error: insErr } = await supabase
      .from('support_threads')
      .insert({
        company_id: company_id.trim(),
        user_id: userId,
        status: 'OPEN',
      })
      .select()
      .single();

    if (insErr) {
      console.error('Erro POST /support/threads:', insErr.message);
      return res.status(500).json({ error: 'Erro ao criar thread' });
    }

    await auditEvent({
      actor_user_id: userId,
      actor_role: role,
      action: 'SUPPORT_THREAD_CREATE',
      target_type: 'support_thread',
      target_id: thread.id,
      company_id: company_id.trim(),
      payload: { thread_id: thread.id },
    });

    return res.status(201).json(thread);
  } catch (err) {
    console.error('Erro POST /support/threads:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

// GET /support/threads/:thread_id — USER lê próprio thread (CONSULTOR usa /consultor/support/threads/:id)
router.get('/support/threads/:thread_id', requireAuth, async (req, res) => {
  try {
    const threadId = req.params.thread_id;
    const userId = req.user.id;

    const { data: thread, error: tErr } = await supabase
      .from('support_threads')
      .select('id, company_id, user_id, status, created_at, closed_at')
      .eq('id', threadId)
      .maybeSingle();

    if (tErr || !thread) {
      return res.status(404).json({ error: 'Thread não encontrado' });
    }

    const { data: company } = await supabase
      .from('companies')
      .select('owner_user_id')
      .eq('id', thread.company_id)
      .maybeSingle();

    const isOwner = company?.owner_user_id === userId;
    const isThreadUser = thread.user_id === userId;
    if (!isOwner && !isThreadUser) {
      return res.status(403).json({ error: 'Sem acesso a este thread' });
    }

    const { data: messages } = await supabase
      .from('support_thread_messages')
      .select('id, author_user_id, author_role, message, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    return res.json({ thread, messages: messages || [] });
  } catch (err) {
    console.error('Erro GET /support/threads/:id:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

// POST /support/threads/:thread_id/messages — USER/CONSULTOR/ADMIN
router.post('/support/threads/:thread_id/messages', requireAuth, requireAnyRole(['USER', 'CONSULTOR', 'ADMIN']), async (req, res) => {
  try {
    const threadId = req.params.thread_id;
    const userId = req.user.id;
    const role = req.user.role || 'USER';
    const { message } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'message é obrigatório' });
    }

    const { data: thread, error: tErr } = await supabase
      .from('support_threads')
      .select('id, company_id, user_id, status')
      .eq('id', threadId)
      .maybeSingle();

    if (tErr || !thread) {
      return res.status(404).json({ error: 'Thread não encontrado' });
    }
    if (thread.status === 'CLOSED') {
      return res.status(400).json({ error: 'Thread fechado' });
    }

    const { data: company } = await supabase
      .from('companies')
      .select('owner_user_id')
      .eq('id', thread.company_id)
      .maybeSingle();

    const isOwner = company?.owner_user_id === userId;
    const isThreadUser = thread.user_id === userId;
    const isConsultorOrAdmin = role === 'CONSULTOR' || role === 'ADMIN';

    if (!isOwner && !isThreadUser && !isConsultorOrAdmin) {
      return res.status(403).json({ error: 'Sem acesso a este thread' });
    }

    const authorRole = role === 'ADMIN' ? 'ADMIN' : role === 'CONSULTOR' ? 'CONSULTOR' : 'USER';

    const { data: msg, error: insErr } = await supabase
      .from('support_thread_messages')
      .insert({
        thread_id: threadId,
        author_user_id: userId,
        author_role: authorRole,
        message: message.trim(),
      })
      .select()
      .single();

    if (insErr) {
      console.error('Erro POST /support/threads/:id/messages:', insErr.message);
      return res.status(500).json({ error: 'Erro ao enviar mensagem' });
    }

    await auditEvent({
      actor_user_id: userId,
      actor_role: role,
      action: 'SUPPORT_MESSAGE_CREATE',
      target_type: 'support_thread_message',
      target_id: msg.id,
      company_id: thread.company_id,
      payload: { thread_id: threadId, message_id: msg.id },
    });

    return res.status(201).json(msg);
  } catch (err) {
    console.error('Erro POST /support/threads/:id/messages:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

module.exports = router;
