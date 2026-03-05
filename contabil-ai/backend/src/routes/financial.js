const { Router } = require('express');
const financialController = require('../controllers/financialController');
const { authenticate, authorize } = require('../middleware/auth');

const router = Router();

router.use(authenticate);

// Insights
router.get('/insights', financialController.getInsights);
router.get('/insights/unacknowledged', financialController.getUnacknowledgedAlerts);
router.post('/insights/:id/acknowledge', financialController.acknowledgeInsight);

// Snapshots & Patterns
router.get('/snapshots', financialController.getSnapshots);
router.get('/patterns', financialController.getPatterns);
router.get('/context/:companyId', financialController.getCompanyContext);

// Trigger analysis (admin only)
router.post('/analyze', authorize('office_admin', 'superadmin'), financialController.triggerAnalysis);

// Alerts
router.get('/alerts', financialController.getAlerts);
router.post('/alerts/:id/read', financialController.markAlertRead);

// Alert Rules (admin only)
router.get('/alert-rules', financialController.getAlertRules);
router.post('/alert-rules', authorize('office_admin', 'superadmin'), financialController.createAlertRule);
router.put('/alert-rules/:id', authorize('office_admin', 'superadmin'), financialController.updateAlertRule);

module.exports = router;
