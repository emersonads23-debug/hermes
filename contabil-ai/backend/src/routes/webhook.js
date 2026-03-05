const { Router } = require('express');
const crypto = require('crypto');
const env = require('../config/env');
const logger = require('../config/logger');
const webhookController = require('../controllers/webhookController');

const router = Router();

function webhookAuth(req, res, next) {
  // Check Evolution API key header
  if (req.headers['apikey'] && req.headers['apikey'] === env.evolution.apiKey) {
    return next();
  }

  // Check HMAC webhook signature
  const signature = req.headers['x-webhook-signature'] || req.headers['x-evolution-signature'];
  if (signature && env.evolution.webhookSecret) {
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const expected = crypto
      .createHmac('sha256', env.evolution.webhookSecret)
      .update(rawBody)
      .digest('hex');
    if (crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
      return next();
    }
  }

  logger.warn('Webhook authentication failed', { ip: req.ip });
  return res.status(401).json({ error: 'Unauthorized' });
}

router.post('/evolution', webhookAuth, webhookController.handleEvolutionWebhook);

module.exports = router;
