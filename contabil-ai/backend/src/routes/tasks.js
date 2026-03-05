const { Router } = require('express');
const taskController = require('../controllers/taskController');
const { authenticate, authorize } = require('../middleware/auth');

const router = Router();

router.use(authenticate);

router.get('/', taskController.list);
router.get('/stats', taskController.stats);
router.get('/:id', taskController.get);
router.post('/', authorize('office_admin', 'superadmin'), taskController.create);
router.put('/:id', taskController.update);
router.post('/:id/assign', authorize('office_admin', 'superadmin'), taskController.assign);

module.exports = router;
