const { Router } = require('express');
const { z } = require('zod');
const taskController = require('../controllers/taskController');
const { authenticate, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');

const createTaskSchema = z.object({
  title: z.string().min(1, 'Titulo obrigatorio'),
  description: z.string().optional(),
  task_type: z.string().optional(),
  company_id: z.string().uuid().optional(),
  assigned_to: z.string().uuid().optional(),
  due_date: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
});

const router = Router();

router.use(authenticate);

router.get('/', taskController.list);
router.get('/stats', taskController.stats);
router.get('/:id', taskController.get);
router.post('/', authorize('office_admin', 'superadmin'), validate(createTaskSchema), taskController.create);
router.put('/:id', taskController.update);
router.post('/:id/assign', authorize('office_admin', 'superadmin'), taskController.assign);

module.exports = router;
