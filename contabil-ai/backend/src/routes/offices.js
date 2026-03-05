const { Router } = require('express');
const { z } = require('zod');
const officeController = require('../controllers/officeController');
const { authenticate, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { asyncHandler } = require('../middleware/errorHandler');

const router = Router();

const createSchema = z.object({
  name: z.string().min(2),
  cnpj: z.string().min(14).max(18),
  email: z.string().email(),
  phone: z.string().optional(),
  adminName: z.string().min(2),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8),
});

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  cnpj: z.string().min(14).max(18).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

router.use(authenticate);

router.get('/', authorize('superadmin'), asyncHandler(officeController.list));
router.get('/:id', authorize('superadmin', 'office_admin'), asyncHandler(officeController.getById));
router.post('/', authorize('superadmin'), validate(createSchema), asyncHandler(officeController.create));
router.put('/:id', authorize('superadmin', 'office_admin'), validate(updateSchema), asyncHandler(officeController.update));
router.delete('/:id', authorize('superadmin'), asyncHandler(officeController.remove));

module.exports = router;
