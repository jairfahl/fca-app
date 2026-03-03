const express = require('express');
const router = express.Router();
const { supabase, logConsultorError } = require('./shared');

// GET /consultor/users — lista usuários (USER) paginada
// DTO: user_id, email, role, company_id, company_name, last_seen_at (company_id opcional)
// Email: user_profiles (canônico) ou fallback auth.admin
router.get('/users', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;
    const companyIdFilter = req.query.company_id || null;

    const { data: companies, error: cErr } = await supabase
      .schema('public')
      .from('companies')
      .select('id, name, owner_user_id')
      .not('owner_user_id', 'is', null);

    if (cErr) {
      console.error('Erro GET /consultor/users:', cErr.message);
      return res.status(500).json({ error: 'Erro ao listar usuários' });
    }

    const companiesByOwner = {};
    (companies || []).forEach((c) => {
      const uid = c.owner_user_id;
      if (!companiesByOwner[uid]) companiesByOwner[uid] = [];
      companiesByOwner[uid].push({ id: c.id, name: c.name });
    });
    let ownerIds = Object.keys(companiesByOwner);

    let filteredOwnerIds = ownerIds;
    if (companyIdFilter) {
      const targetCompany = companies?.find((c) => c.id === companyIdFilter);
      filteredOwnerIds = targetCompany?.owner_user_id ? [targetCompany.owner_user_id] : [];
    }

    if (filteredOwnerIds.length === 0) {
      return res.json({ users: [], pagination: { page, limit, total: 0, offset } });
    }

    const { data: profiles } = await supabase.schema('public').from('user_profiles').select('user_id, email, role').in('user_id', filteredOwnerIds);
    const profileByUid = Object.fromEntries((profiles || []).map((p) => [p.user_id, p]));

    let authUsers = [];
    try {
      const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      authUsers = users || [];
    } catch (_) { /* listUsers pode falhar em alguns projetos */ }

    const list = filteredOwnerIds
      .map((uid) => {
        const profile = profileByUid[uid];
        const authUser = authUsers.find((u) => u.id === uid);
        const email = profile?.email || authUser?.email || null;
        const comps = companiesByOwner[uid] || [];
        const targetCompany = companyIdFilter ? companies?.find((c) => c.id === companyIdFilter) : null;
        const primaryCompany = companyIdFilter && targetCompany ? { id: targetCompany.id, name: targetCompany.name } : comps[0];
        return {
          user_id: uid,
          email,
          role: profile?.role || null,
          company_id: primaryCompany?.id || null,
          company_name: primaryCompany?.name || null,
          companies_count: comps.length,
          created_at: authUser?.created_at || null,
          last_sign_in_at: authUser?.last_sign_in_at || null,
        };
      })
      .sort((a, b) => (a.email || '').localeCompare(b.email || ''));

    const total = list.length;
    const paginated = list.slice(offset, offset + limit);

    return res.json({
      users: paginated,
      pagination: { page, limit, total, offset },
    });
  } catch (err) {
    console.error('Erro GET /consultor/users:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

// GET /consultor/users/:user_id/diagnosticos?company_id= — diagnósticos LIGHT + FULL do usuário
// DTO: user_id, email, company_id, company_name, light[], full[] (sem expor UUID como identificador principal)
router.get('/users/:user_id/diagnosticos', async (req, res) => {
  try {
    const userId = req.params.user_id;
    const companyId = req.query.company_id;

    const { data: company, error: cErr } = await supabase
      .schema('public')
      .from('companies')
      .select('id, name, owner_user_id')
      .eq('id', companyId)
      .maybeSingle();

    if (cErr || !company) return res.status(404).json({ error: 'Empresa não encontrada' });
    if (company.owner_user_id !== userId) return res.status(403).json({ error: 'Empresa não pertence ao usuário' });

    // Email: user_profiles (canônico) ou fallback auth.admin
    let email = null;
    const { data: profile } = await supabase.schema('public').from('user_profiles').select('email').eq('user_id', userId).maybeSingle();
    if (profile?.email) {
      email = profile.email;
    } else {
      try {
        const { data: { user } } = await supabase.auth.admin.getUserById(userId);
        email = user?.email || null;
      } catch (_) { /* listUsers/getUserById pode falhar */ }
    }

    const [lightRes, fullRes] = await Promise.all([
      supabase.schema('public').from('assessments').select('id, status, created_at, completed_at').eq('company_id', companyId).eq('type', 'LIGHT').order('created_at', { ascending: false }),
      supabase.schema('public').from('full_assessments').select('id, status, created_at, submitted_at, closed_at').eq('company_id', companyId).order('created_at', { ascending: false }),
    ]);

    const light = (lightRes.data || []).map((a) => ({
      id: a.id,
      status: a.status,
      created_at: a.created_at,
      last_saved_at: a.created_at,
      submitted_at: a.completed_at,
    }));
    const full = (fullRes.data || []).map((a) => ({
      id: a.id,
      status: a.status,
      created_at: a.created_at,
      last_saved_at: a.created_at,
      submitted_at: a.submitted_at,
      closed_at: a.closed_at,
    }));

    return res.json({
      user_id: userId,
      email: email || null,
      company_id: companyId,
      company_name: company.name || null,
      light,
      full,
    });
  } catch (err) {
    console.error('Erro GET /consultor/users/:user_id/diagnosticos:', err.message);
    return res.status(500).json({ error: 'Erro inesperado' });
  }
});

module.exports = router;
