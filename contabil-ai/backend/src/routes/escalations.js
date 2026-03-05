const { Router } = require('express');
const escalationController = require('../controllers/escalationController');
const { authenticate, authorize } = require('../middleware/auth');

const router = Router();

router.use(authenticate);

router.get('/', authorize('superadmin', 'office_admin', 'accountant'), escalationController.list);
router.put('/:id', authorize('superadmin', 'office_admin', 'accountant'), escalationController.update);

module.exports = router;
