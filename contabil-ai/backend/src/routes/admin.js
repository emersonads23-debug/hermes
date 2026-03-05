const { Router } = require('express');
const adminController = require('../controllers/adminController');
const { authenticate, authorize } = require('../middleware/auth');

const router = Router();

router.use(authenticate);
router.use(authorize('superadmin', 'office_admin'));

router.get('/stats', adminController.getStats);
router.get('/whatsapp-instances', adminController.getWhatsappInstances);
router.post('/whatsapp/reconnect', adminController.reconnectWhatsapp);
router.get('/whatsapp/qr', adminController.getWhatsappQr);
router.get('/erp-integrations', adminController.getErpIntegrations);
router.post('/erp/test', adminController.testErpConnection);

module.exports = router;
