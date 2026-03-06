const { Router } = require('express');
const crypto = require('crypto');
const env = require('../config/env');
const logger = require('../config/logger');
const supabase = require('../config/supabase');
const webhookController = require('../controllers/webhookController');

const router = Router();

async function webhookAuth(req, res, next) {
  const apikey = req.headers['apikey'];

  // Check global Evolution API key
  if (apikey && env.evolution.apiKey && apikey === env.evolution.apiKey) {
    return next();
  }

  // Check per-office Evolution API keys
  if (apikey) {
    const { data: office } = await supabase
      .from('offices')
      .select('id')
      .eq('evolution_api_key', apikey)
      .single();

    if (office) {
      req.officeId = office.id;
      return next();
    }
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

  logger.warn('Webhook authentication failed', { ip: req.ip, hasApikey: !!apikey });
  return res.status(401).json({ error: 'Unauthorized' });
}

router.post('/evolution', webhookAuth, webhookController.handleEvolutionWebhook);

module.exports = router;
