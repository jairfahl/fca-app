/**
 * Rotas /admin/users — gestão de roles (somente ADMIN)
 * POST /admin/users/role — setar role por email
 * GET /admin/users — listar user_profiles (paginado, query)
 */
const express = require('express');
const router = express.Router();
const { supabase } = require('../../lib/supabase');
const { auditEvent } = require('../../lib/audit');

const ROLES = ['USER', 'CONSULTOR', 'ADMIN'];

/** Localiza user no Auth por email (listUsers + filter) */
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

/** POST /users/role — setar app_metadata.role + upsert user_profiles */
router.post('/users/role', async (req, res) => {
  try {
    const { email, role } = req.body;
    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ error: 'email é obrigatório' });
    }
    if (!role || !ROLES.includes(role)) {
      return res.status(400).json({ error: 'role deve ser USER, CONSULTOR ou ADMIN' });
    }

    const authUser = await findUserByEmail(email.trim());
    if (!authUser) {
      return res.status(404).json({ error: 'Usuário não encontrado no Auth' });
    }

    const { error: updateErr } = await supabase.auth.admin.updateUserById(authUser.id, {
      app_metadata: { ...authUser.app_metadata, role },
    });
    if (updateErr) {
      console.error('Erro POST /admin/users/role (Auth):', updateErr.message);
      return res.status(500).json({ error: 'Erro ao atualizar role no Auth' });
    }

    const { error: upsertErr } = await supabase
      .from('user_profiles')
      .upsert(
        {
          user_id: authUser.id,
          email: authUser.email?.toLowerCase() || authUser.email,
          role,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
    if (upsertErr) {
      console.error('Erro POST /admin/users/role (user_profiles):', upsertErr.message);
      return res.status(500).json({ error: 'Erro ao atualizar user_profiles' });
    }

    await auditEvent({
      actor_user_id: req.user.id,
      actor_role: req.user.role,
      action: 'ADMIN_SET_ROLE',
      target_type: 'user',
      target_id: authUser.id,
      payload: { email: authUser.email, role },
    });

    return res.json({ user_id: authUser.id, email: authUser.email, role });
  } catch (err) {
    console.error('Erro POST /admin/users/role:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

/** GET /users — listar user_profiles (paginado, query) */
router.get('/users', async (req, res) => {
  try {
    const query = (req.query.query || '').trim();
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

    let q = supabase.from('user_profiles').select('user_id, email, role, updated_at', { count: 'exact' });

    if (query) {
      const safe = String(query).replace(/[%_\\]/g, '');
      const pattern = `%${safe}%`;
      q = q.or(`email.ilike.${pattern},role.ilike.${pattern}`);
    }

    q = q.order('email', { ascending: true }).range(offset, offset + limit - 1);

    const { data, error, count } = await q;
    if (error) {
      console.error('Erro GET /admin/users:', error.message);
      return res.status(500).json({ error: 'Erro ao listar usuários' });
    }

    return res.json({ users: data || [], total: count ?? 0 });
  } catch (err) {
    console.error('Erro GET /admin/users:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

module.exports = router;
