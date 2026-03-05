const { Router } = require('express');
const copilotController = require('../controllers/copilotController');
const { authenticate, authorize } = require('../middleware/auth');

const router = Router();

router.use(authenticate);

// Sessions and actions
router.get('/sessions', copilotController.getSessions);
router.get('/sessions/:id/actions', copilotController.getSessionDetail);
router.get('/actions', copilotController.getRecentActions);

// Trigger copilot manually (admin only)
router.post('/evaluate', authorize('office_admin', 'superadmin'), copilotController.triggerEvaluation);

// Ask copilot a question
router.post('/ask', copilotController.askCopilot);

module.exports = router;
