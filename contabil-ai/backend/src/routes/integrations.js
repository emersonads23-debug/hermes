const { Router } = require('express');
const integrationController = require('../controllers/integrationController');
const { authenticate, authorize } = require('../middleware/auth');

const router = Router();

router.use(authenticate);

router.get('/', integrationController.listIntegrations);
router.get('/contaazul/auth', authorize('superadmin', 'office_admin'), integrationController.contaAzulAuth);
router.get('/contaazul/callback', integrationController.contaAzulCallback);
router.post('/omie', authorize('superadmin', 'office_admin'), integrationController.saveOmieCredentials);
router.delete('/:provider', authorize('superadmin', 'office_admin'), integrationController.removeIntegration);

module.exports = router;
