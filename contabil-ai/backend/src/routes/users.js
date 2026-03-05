const { Router } = require('express');
const { z } = require('zod');
const userController = require('../controllers/userController');
const { authenticate, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = Router();

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['office_admin', 'accountant', 'viewer']),
  phone: z.string().min(10).max(20).optional(),
  office_id: z.string().uuid().optional(),
});

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  role: z.enum(['office_admin', 'accountant', 'viewer']).optional(),
  phone: z.string().min(10).max(20).nullable().optional(),
  active: z.boolean().optional(),
});

const { asyncHandler } = require('../middleware/errorHandler');

router.use(authenticate);

router.get('/', asyncHandler(userController.list));
router.get('/:id', asyncHandler(userController.getById));
router.post('/', authorize('superadmin', 'office_admin'), validate(createSchema), asyncHandler(userController.create));
router.put('/:id', authorize('superadmin', 'office_admin'), validate(updateSchema), asyncHandler(userController.update));
router.delete('/:id', authorize('superadmin', 'office_admin'), asyncHandler(userController.remove));
router.put('/:userId/companies', authorize('superadmin', 'office_admin'), asyncHandler(userController.assignCompanies));

module.exports = router;
