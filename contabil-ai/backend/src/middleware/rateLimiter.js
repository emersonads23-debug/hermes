const rateLimit = require('express-rate-limit');
const logger = require('../config/logger');

// Global API limiter (fallback)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisicoes. Tente novamente em alguns minutos.' },
  handler: (req, res, next, options) => {
    logger.warn('rate_limit_global', { ip: req.ip, path: req.originalUrl });
    res.status(options.statusCode).json(options.message);
  },
});

// Auth routes — stricter (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Aguarde 15 minutos.' },
  handler: (req, res, next, options) => {
    logger.warn('rate_limit_auth', { ip: req.ip });
    res.status(options.statusCode).json(options.message);
  },
});

// Webhook — higher limit (Evolution sends frequent events)
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Webhook rate limit exceeded.' },
});

// Integration OAuth — moderate limit
const integrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisicoes de integracao. Tente novamente em alguns minutos.' },
});

// Per-tenant limiter using office_id from JWT
const tenantLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.office_id || req.ip,
  message: { error: 'Limite de requisicoes por escritorio atingido. Aguarde um momento.' },
  handler: (req, res, next, options) => {
    logger.warn('rate_limit_tenant', { officeId: req.user?.office_id, ip: req.ip });
    res.status(options.statusCode).json(options.message);
  },
});

module.exports = {
  globalLimiter,
  authLimiter,
  webhookLimiter,
  integrationLimiter,
  tenantLimiter,
};
