const { Router } = require('express');
const { z } = require('zod');
const companyController = require('../controllers/companyController');
const { authenticate, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = Router();

const createSchema = z.object({
  name: z.string().min(2),
  cnpj: z.string().min(14).max(18),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  office_id: z.string().uuid().optional(),
  erp_type: z.enum(['conta_azul', 'omie']).optional(),
  erp_token: z.string().optional(),
  erp_refresh_token: z.string().optional(),
  whatsapp_phone: z.string().optional(),
});

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  cnpj: z.string().min(14).max(18).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  erp_type: z.enum(['conta_azul', 'omie']).optional(),
  erp_token: z.string().optional(),
  erp_refresh_token: z.string().optional(),
  whatsapp_phone: z.string().optional(),
});

router.use(authenticate);

router.get('/', companyController.list);
router.get('/:id', companyController.getById);
router.post('/', authorize('superadmin', 'office_admin'), validate(createSchema), companyController.create);
router.put('/:id', authorize('superadmin', 'office_admin'), validate(updateSchema), companyController.update);
router.delete('/:id', authorize('superadmin', 'office_admin'), companyController.remove);

module.exports = router;
