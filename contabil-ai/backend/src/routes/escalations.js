const { Router } = require('express');
const escalationController = require('../controllers/escalationController');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = Router();

router.use(authenticate);

router.get('/', asyncHandler(escalationController.list));
router.put('/:id', authorize('superadmin', 'office_admin', 'accountant'), asyncHandler(escalationController.update));

module.exports = router;
