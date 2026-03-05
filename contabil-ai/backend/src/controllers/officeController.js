const bcrypt = require('bcryptjs');
const supabase = require('../config/supabase');

async function list(req, res) {
  const { data, error } = await supabase
    .from('offices')
    .select('*')
    .order('name');

  if (error) return res.status(500).json({ error: error.message });
  res.json({ offices: data });
}

async function getById(req, res) {
  // Non-superadmin can only view their own office
  if (req.user.role !== 'superadmin' && req.params.id !== req.user.office_id) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const { data, error } = await supabase
    .from('offices')
    .select('*, companies(*), users(id, name, email, role, active)')
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(404).json({ error: 'Escritorio nao encontrado' });
  res.json({ office: data });
}

async function update(req, res) {
  if (req.user.role !== 'superadmin' && req.params.id !== req.user.office_id) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const { data, error } = await supabase
    .from('offices')
    .update(req.validated)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ office: data });
}

async function remove(req, res) {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const { error } = await supabase
    .from('offices')
    .update({ active: false })
    .eq('id', req.params.id);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Escritorio desativado' });
}

async function create(req, res) {
  const { name, cnpj, email, phone, adminName, adminEmail, adminPassword } = req.validated;

  const { data: office, error: officeErr } = await supabase
    .from('offices')
    .insert({ name, cnpj, email, phone })
    .select()
    .single();

  if (officeErr) return res.status(400).json({ error: officeErr.message });

  const hash = await bcrypt.hash(adminPassword, 12);
  const { error: userErr } = await supabase.from('users').insert({
    office_id: office.id,
    name: adminName,
    email: adminEmail,
    password_hash: hash,
    role: 'office_admin',
  });

  if (userErr) return res.status(400).json({ error: userErr.message });

  res.status(201).json({ office });
}

async function reactivate(req, res) {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const { data, error } = await supabase
    .from('offices')
    .update({ active: true })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ office: data, message: 'Escritorio reativado' });
}

module.exports = { list, getById, create, update, remove, reactivate };
