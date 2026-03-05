const { Router } = require('express');
const integrationController = require('../controllers/integrationController');
const { authenticate, authorize } = require('../middleware/auth');

const router = Router();

// Conta Azul callback is a browser redirect — no JWT available,
// state param is validated instead (CSRF protection)
router.get('/contaazul/callback', integrationController.contaAzulCallback);

// All other routes require authentication
router.use(authenticate);

router.get('/', integrationController.listIntegrations);
router.get('/health', integrationController.checkIntegrationHealth);
router.get('/contaazul/auth', authorize('superadmin', 'office_admin'), integrationController.contaAzulAuth);
router.post('/omie', authorize('superadmin', 'office_admin'), integrationController.saveOmieCredentials);
router.delete('/:provider', authorize('superadmin', 'office_admin'), integrationController.removeIntegration);

module.exports = router;
