const supabase = require('../config/supabase');

async function list(req, res) {
  let query = supabase
    .from('companies')
    .select('*, office:offices(name)')
    .order('name');

  if (req.user.role !== 'superadmin') {
    query = query.eq('office_id', req.user.office_id);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ companies: data });
}

async function getById(req, res) {
  let query = supabase
    .from('companies')
    .select('*, office:offices(name), whatsapp_contacts(*)')
    .eq('id', req.params.id);

  // Tenant isolation: non-superadmin can only see own office's companies
  if (req.user.role !== 'superadmin') {
    query = query.eq('office_id', req.user.office_id);
  }

  const { data, error } = await query.single();

  if (error) return res.status(404).json({ error: 'Empresa nao encontrada' });
  res.json({ company: data });
}

async function create(req, res) {
  const officeId = req.user.role === 'superadmin'
    ? req.validated.office_id
    : req.user.office_id;

  const { data, error } = await supabase
    .from('companies')
    .insert({ ...req.validated, office_id: officeId })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ company: data });
}

async function update(req, res) {
  let query = supabase
    .from('companies')
    .update(req.validated)
    .eq('id', req.params.id);

  if (req.user.role !== 'superadmin') {
    query = query.eq('office_id', req.user.office_id);
  }

  const { data, error } = await query.select().single();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ company: data });
}

async function remove(req, res) {
  let query = supabase
    .from('companies')
    .update({ active: false })
    .eq('id', req.params.id);

  if (req.user.role !== 'superadmin') {
    query = query.eq('office_id', req.user.office_id);
  }

  const { error } = await query;

  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Empresa desativada' });
}

module.exports = { list, getById, create, update, remove };
