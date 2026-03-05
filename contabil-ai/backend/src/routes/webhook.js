const { Router } = require('express');
const webhookController = require('../controllers/webhookController');

const router = Router();

router.post('/evolution', webhookController.handleEvolutionWebhook);

module.exports = router;
