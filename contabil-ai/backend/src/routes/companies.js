const { Router } = require('express');
const { z } = require('zod');
const companyController = require('../controllers/companyController');
const { authenticate, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { asyncHandler } = require('../middleware/errorHandler');
const supabase = require('../config/supabase');

const router = Router();

const createSchema = z.object({
  name: z.string().min(2),
  cnpj: z.string().min(14).max(18),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  office_id: z.string().uuid().optional(),
});

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  cnpj: z.string().min(14).max(18).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

const contactSchema = z.object({
  phone: z.string().min(10).max(20),
  name: z.string().min(2).optional(),
});

router.use(authenticate);

router.get('/', asyncHandler(companyController.list));
router.get('/:id', asyncHandler(companyController.getById));
router.post('/', authorize('superadmin', 'office_admin'), validate(createSchema), asyncHandler(companyController.create));
router.put('/:id', authorize('superadmin', 'office_admin'), validate(updateSchema), asyncHandler(companyController.update));
router.delete('/:id', authorize('superadmin', 'office_admin'), asyncHandler(companyController.remove));

// WhatsApp contacts for a company
router.get('/:id/contacts', asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('whatsapp_contacts')
    .select('*')
    .eq('company_id', req.params.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ contacts: data });
}));

router.post('/:id/contacts', authorize('superadmin', 'office_admin'), validate(contactSchema), asyncHandler(async (req, res) => {
  const phone = req.validated.phone.replace(/\D/g, '');

  const { data, error } = await supabase
    .from('whatsapp_contacts')
    .insert({
      company_id: req.params.id,
      phone,
      name: req.validated.name || null,
      active: true,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Este telefone ja esta cadastrado' });
    }
    return res.status(400).json({ error: error.message });
  }
  res.status(201).json({ contact: data });
}));

router.delete('/:id/contacts/:contactId', authorize('superadmin', 'office_admin'), asyncHandler(async (req, res) => {
  const { error } = await supabase
    .from('whatsapp_contacts')
    .delete()
    .eq('id', req.params.contactId)
    .eq('company_id', req.params.id);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Contato removido' });
}));

module.exports = router;
