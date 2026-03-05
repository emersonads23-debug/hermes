const { Router } = require('express');
const { z } = require('zod');
const companyController = require('../controllers/companyController');
const { authenticate, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { asyncHandler } = require('../middleware/errorHandler');

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

router.use(authenticate);

router.get('/', asyncHandler(companyController.list));
router.get('/:id', asyncHandler(companyController.getById));
router.post('/', authorize('superadmin', 'office_admin'), validate(createSchema), asyncHandler(companyController.create));
router.put('/:id', authorize('superadmin', 'office_admin'), validate(updateSchema), asyncHandler(companyController.update));
router.delete('/:id', authorize('superadmin', 'office_admin'), asyncHandler(companyController.remove));

module.exports = router;
