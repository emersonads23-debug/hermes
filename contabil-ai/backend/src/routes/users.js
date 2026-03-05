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
  office_id: z.string().uuid().optional(),
});

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  role: z.enum(['office_admin', 'accountant', 'viewer']).optional(),
  active: z.boolean().optional(),
});

router.use(authenticate);

router.get('/', authorize('superadmin', 'office_admin'), userController.list);
router.get('/:id', authorize('superadmin', 'office_admin'), userController.getById);
router.post('/', authorize('superadmin', 'office_admin'), validate(createSchema), userController.create);
router.put('/:id', authorize('superadmin', 'office_admin'), validate(updateSchema), userController.update);
router.delete('/:id', authorize('superadmin', 'office_admin'), userController.remove);
router.put('/:userId/companies', authorize('superadmin', 'office_admin'), userController.assignCompanies);

module.exports = router;
