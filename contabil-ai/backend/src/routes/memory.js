const { Router } = require('express');
const memoryController = require('../controllers/memoryController');
const { authenticate, authorize } = require('../middleware/auth');

const router = Router();

router.use(authenticate);

// Query memories
router.get('/', memoryController.getMemories);
router.get('/search', memoryController.searchMemories);
router.get('/stats', memoryController.getStats);

// Learn from confirmed actions
router.post('/confirm-classification', memoryController.confirmClassification);
router.post('/confirm-reconciliation', memoryController.confirmReconciliation);

// Human feedback for continuous learning
router.post('/confirm', memoryController.humanConfirm);
router.post('/correct', memoryController.humanCorrect);

// Delete a memory (admin only)
router.delete('/:id', authorize('office_admin', 'superadmin'), memoryController.deleteMemory);

module.exports = router;
