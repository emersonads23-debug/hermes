const bcrypt = require('bcryptjs');
const supabase = require('../config/supabase');
const logger = require('../config/logger');

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
  const { name, cnpj, email, phone, adminName, adminEmail, adminPassword, plan, max_companies, logo, adminPhone } = req.validated;

  const { data: office, error: officeErr } = await supabase
    .from('offices')
    .insert({
      name,
      cnpj,
      email,
      phone,
      plan: plan || 'basic',
      max_companies: max_companies || 10,
      logo: logo || null,
    })
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
    phone: adminPhone || null,
  });

  if (userErr) return res.status(400).json({ error: userErr.message });

  // Auto-create WhatsApp instance for office
  try {
    const whatsappService = require('../services/whatsappService');
    await whatsappService.createInstance();
    logger.info('WhatsApp instance created for office', { officeId: office.id });
  } catch (err) {
    logger.warn('Failed to create WhatsApp instance for office', { officeId: office.id, error: err.message });
  }

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
    .update({ active: false })
    .eq('id', req.params.id);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Escritorio desativado' });
}

module.exports = { list, getById, create, update, remove };
