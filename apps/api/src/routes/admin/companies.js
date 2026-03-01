/**
 * Rotas /admin/companies — gestão de members e consultant-access (somente ADMIN)
 * POST /admin/companies/:company_id/members — upsert membership
 * DELETE /admin/companies/:company_id/members?email=... — remove membership
 * POST /admin/companies/:company_id/consultant-access — upsert consultant access
 */
const express = require('express');
const router = express.Router();
const { isValidUuid } = require('../../middleware/guards');
const { supabase } = require('../../lib/supabase');
const { auditEvent } = require('../../lib/audit');

const MEMBER_ROLES = ['OWNER', 'MEMBER'];
const MEMBER_STATUS = ['ACTIVE', 'INACTIVE'];
const ACCESS_LEVELS = ['READ', 'SUPPORT'];

/** Localiza user no Auth por email */
async function findUserByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;

  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data: { users }, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = users?.find((u) => u.email?.toLowerCase() === normalized);
    if (found) return found;
    if (!users || users.length < perPage) return null;
    page++;
  }
}

/** POST /companies/:company_id/members */
router.post('/companies/:company_id/members', async (req, res) => {
  try {
    const companyId = req.params.company_id?.trim();
    if (!companyId || !isValidUuid(companyId)) {
      return res.status(400).json({ error: 'company_id inválido' });
    }

    const { email, member_role = 'MEMBER', status = 'ACTIVE' } = req.body;
    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ error: 'email é obrigatório' });
    }
    if (!MEMBER_ROLES.includes(member_role)) {
      return res.status(400).json({ error: 'member_role deve ser OWNER ou MEMBER' });
    }
    if (!MEMBER_STATUS.includes(status)) {
      return res.status(400).json({ error: 'status deve ser ACTIVE ou INACTIVE' });
    }

    const authUser = await findUserByEmail(email.trim());
    if (!authUser) {
      return res.status(404).json({ error: 'Usuário não encontrado no Auth' });
    }

    const { data: company } = await supabase.from('companies').select('id').eq('id', companyId).maybeSingle();
    if (!company) {
      return res.status(404).json({ error: 'Empresa não encontrada' });
    }

    const { data, error } = await supabase
      .from('company_members')
      .upsert(
        {
          company_id: companyId,
          user_id: authUser.id,
          member_role,
          status,
        },
        { onConflict: 'company_id,user_id' }
      )
      .select()
      .single();

    if (error) {
      console.error('Erro POST /admin/companies/:id/members:', error.message);
      return res.status(500).json({ error: 'Erro ao salvar membership' });
    }

    await auditEvent({
      actor_user_id: req.user.id,
      actor_role: req.user.role,
      action: 'ADMIN_SET_MEMBER',
      target_type: 'company_member',
      target_id: `${companyId}:${authUser.id}`,
      company_id: companyId,
      payload: { email: authUser.email, member_role, status },
    });

    return res.status(201).json(data);
  } catch (err) {
    console.error('Erro POST /admin/companies/:id/members:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

/** DELETE /companies/:company_id/members?email=... */
router.delete('/companies/:company_id/members', async (req, res) => {
  try {
    const companyId = req.params.company_id?.trim();
    if (!companyId || !isValidUuid(companyId)) {
      return res.status(400).json({ error: 'company_id inválido' });
    }

    const email = req.query.email?.trim();
    if (!email) {
      return res.status(400).json({ error: 'email é obrigatório (query)' });
    }

    const authUser = await findUserByEmail(email);
    if (!authUser) {
      return res.status(404).json({ error: 'Usuário não encontrado no Auth' });
    }

    const { error } = await supabase
      .from('company_members')
      .delete()
      .eq('company_id', companyId)
      .eq('user_id', authUser.id);

    if (error) {
      console.error('Erro DELETE /admin/companies/:id/members:', error.message);
      return res.status(500).json({ error: 'Erro ao remover membership' });
    }

    await auditEvent({
      actor_user_id: req.user.id,
      actor_role: req.user.role,
      action: 'ADMIN_SET_MEMBER',
      target_type: 'company_member',
      target_id: `${companyId}:${authUser.id}`,
      company_id: companyId,
      payload: { email: authUser.email, action: 'removed' },
    });

    return res.status(204).send();
  } catch (err) {
    console.error('Erro DELETE /admin/companies/:id/members:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

/** POST /companies/:company_id/consultant-access */
router.post('/companies/:company_id/consultant-access', async (req, res) => {
  try {
    const companyId = req.params.company_id?.trim();
    if (!companyId || !isValidUuid(companyId)) {
      return res.status(400).json({ error: 'company_id inválido' });
    }

    const { email, access_level = 'READ' } = req.body;
    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ error: 'email é obrigatório (consultor)' });
    }
    if (!ACCESS_LEVELS.includes(access_level)) {
      return res.status(400).json({ error: 'access_level deve ser READ ou SUPPORT' });
    }

    const authUser = await findUserByEmail(email.trim());
    if (!authUser) {
      return res.status(404).json({ error: 'Usuário não encontrado no Auth' });
    }

    const { data: company } = await supabase.from('companies').select('id').eq('id', companyId).maybeSingle();
    if (!company) {
      return res.status(404).json({ error: 'Empresa não encontrada' });
    }

    const { data, error } = await supabase
      .from('consultant_company_access')
      .upsert(
        {
          consultant_user_id: authUser.id,
          company_id: companyId,
          access_level,
        },
        { onConflict: 'consultant_user_id,company_id' }
      )
      .select()
      .single();

    if (error) {
      console.error('Erro POST /admin/companies/:id/consultant-access:', error.message);
      return res.status(500).json({ error: 'Erro ao salvar consultant-access' });
    }

    await auditEvent({
      actor_user_id: req.user.id,
      actor_role: req.user.role,
      action: 'ADMIN_SET_CONSULTANT_ACCESS',
      target_type: 'consultant_company_access',
      target_id: `${authUser.id}:${companyId}`,
      company_id: companyId,
      payload: { email: authUser.email, access_level },
    });

    return res.status(201).json(data);
  } catch (err) {
    console.error('Erro POST /admin/companies/:id/consultant-access:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

module.exports = router;
