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
  const { data, error } = await supabase
    .from('offices')
    .select('*, companies(*), users(id, name, email, role, active)')
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(404).json({ error: 'Escritorio nao encontrado' });
  res.json({ office: data });
}

async function create(req, res) {
  const {
    name, cnpj, email, phone,
    adminName, adminEmail, adminPassword,
    evolution_instance_url, evolution_api_key, evolution_instance_name, bot_name,
  } = req.validated;

  const officeData = { name, cnpj, email, phone };
  if (evolution_instance_url) officeData.evolution_instance_url = evolution_instance_url;
  if (evolution_api_key) officeData.evolution_api_key = evolution_api_key;
  if (evolution_instance_name) officeData.evolution_instance_name = evolution_instance_name;
  if (bot_name) officeData.bot_name = bot_name;

  const { data: office, error: officeErr } = await supabase
    .from('offices')
    .insert(officeData)
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

async function update(req, res) {
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
  const { error } = await supabase
    .from('offices')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Escritorio excluido' });
}

module.exports = { list, getById, create, update, remove };
