const bcrypt = require('bcryptjs');
const supabase = require('../config/supabase');

const USER_SELECT = 'id, name, email, phone, role, active, office_id, created_at, office:offices(name), user_companies(company:companies(id, name))';

async function list(req, res) {
  let query = supabase
    .from('users')
    .select(USER_SELECT)
    .order('name');

  if (req.user.role !== 'superadmin') {
    query = query.eq('office_id', req.user.office_id);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ users: data });
}

async function getById(req, res) {
  let query = supabase
    .from('users')
    .select(USER_SELECT)
    .eq('id', req.params.id);

  if (req.user.role !== 'superadmin') {
    query = query.eq('office_id', req.user.office_id);
  }

  const { data, error } = await query.single();

  if (error) return res.status(404).json({ error: 'Usuario nao encontrado' });
  res.json({ user: data });
}

async function create(req, res) {
  const { name, email, password, role, phone } = req.validated;
  const officeId = req.user.role === 'superadmin'
    ? req.validated.office_id
    : req.user.office_id;

  const hash = await bcrypt.hash(password, 12);
  const phoneClean = phone ? phone.replace(/\D/g, '') : null;

  const { data, error } = await supabase
    .from('users')
    .insert({ name, email, password_hash: hash, role, office_id: officeId, phone: phoneClean })
    .select('id, name, email, phone, role, active, office_id, created_at')
    .single();

  if (error) {
    if (error.code === '23505' && error.message.includes('phone')) {
      return res.status(400).json({ error: 'Este numero de WhatsApp ja esta cadastrado para outro usuario' });
    }
    return res.status(400).json({ error: error.message });
  }
  res.status(201).json({ user: data });
}

async function update(req, res) {
  const updates = { ...req.validated };
  if (updates.password) {
    updates.password_hash = await bcrypt.hash(updates.password, 12);
    delete updates.password;
  }
  if (updates.phone) {
    updates.phone = updates.phone.replace(/\D/g, '');
  }

  let query = supabase
    .from('users')
    .update(updates)
    .eq('id', req.params.id);

  if (req.user.role !== 'superadmin') {
    query = query.eq('office_id', req.user.office_id);
  }

  const { data, error } = await query
    .select('id, name, email, phone, role, active, office_id, created_at')
    .single();

  if (error) {
    if (error.code === '23505' && error.message.includes('phone')) {
      return res.status(400).json({ error: 'Este numero de WhatsApp ja esta cadastrado para outro usuario' });
    }
    return res.status(400).json({ error: error.message });
  }
  res.json({ user: data });
}

async function remove(req, res) {
  let query = supabase
    .from('users')
    .update({ active: false })
    .eq('id', req.params.id);

  if (req.user.role !== 'superadmin') {
    query = query.eq('office_id', req.user.office_id);
  }

  const { error } = await query;

  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Usuario desativado' });
}

async function assignCompanies(req, res) {
  const { userId } = req.params;
  const { companyIds } = req.body;

  // Remove existing assignments
  await supabase.from('user_companies').delete().eq('user_id', userId);

  if (companyIds && companyIds.length > 0) {
    const rows = companyIds.map((companyId) => ({ user_id: userId, company_id: companyId }));
    const { error } = await supabase.from('user_companies').insert(rows);
    if (error) return res.status(400).json({ error: error.message });
  }

  res.json({ message: 'Empresas atribuidas com sucesso' });
}

module.exports = { list, getById, create, update, remove, assignCompanies };
