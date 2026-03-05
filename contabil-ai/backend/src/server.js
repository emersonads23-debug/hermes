const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const env = require('./config/env');
const logger = require('./config/logger');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const officeRoutes = require('./routes/offices');
const companyRoutes = require('./routes/companies');
const userRoutes = require('./routes/users');
const webhookRoutes = require('./routes/webhook');
const integrationRoutes = require('./routes/integrations');
const escalationRoutes = require('./routes/escalations');

const app = express();

// Ensure required directories exist
for (const dir of [path.resolve(env.upload.dir), path.resolve('logs')]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Security
app.use(helmet());
app.use(cors({ origin: env.frontendUrl, credentials: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Webhook route with larger body limit (media payloads)
app.use('/api/webhook', express.json({ limit: '50mb' }), webhookRoutes);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/offices', officeRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/users', userRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/escalations', escalationRoutes);

// Health check endpoint — checks all integration statuses
app.get('/api/health', async (_req, res) => {
  const { healthCheck: supabaseHealth } = require('./config/supabase');
  const whatsappService = require('./services/whatsappService');
  const n8nService = require('./services/n8nService');

  const [db, whatsapp, n8n] = await Promise.allSettled([
    supabaseHealth(),
    whatsappService.healthCheck(),
    n8nService.healthCheck(),
  ]);

  const checks = {
    database: db.status === 'fulfilled' ? db.value : { healthy: false, error: db.reason?.message },
    whatsapp: whatsapp.status === 'fulfilled' ? whatsapp.value : { healthy: false, error: whatsapp.reason?.message },
    n8n: n8n.status === 'fulfilled' ? n8n.value : { healthy: false, error: n8n.reason?.message },
  };

  const allHealthy = Object.values(checks).every((c) => c.healthy);

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services: checks,
  });
});

// Serve frontend in production
if (env.nodeEnv === 'production') {
  app.use(express.static(path.join(__dirname, '../../frontend/dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
  });
}

// Error handler
app.use(errorHandler);

// --- Startup ---

async function startServer() {
  logger.info('Starting ContabilAI server...');

  // Test Supabase connection
  const { testConnection } = require('./config/supabase');
  const dbResult = await testConnection();
  if (!dbResult.healthy) {
    logger.error('CRITICAL: Database connection failed. Server may not function correctly.');
  }

  // Auto-create Evolution instance if configured
  if (env.evolution.apiUrl && env.evolution.apiKey) {
    try {
      const whatsappService = require('./services/whatsappService');
      const instanceStatus = await whatsappService.getInstanceStatus();
      logger.info('Evolution API status', { state: instanceStatus.state });

      if (instanceStatus.state === 'unknown' || instanceStatus.error) {
        logger.info('Attempting to create Evolution instance...');
        await whatsappService.createInstance();
      }
    } catch (err) {
      logger.warn('Evolution API not reachable at startup', { error: err.message });
    }
  }

  // Check n8n connectivity
  if (env.n8n.webhookUrl) {
    const n8nService = require('./services/n8nService');
    const n8nResult = await n8nService.healthCheck();
    if (n8nResult.healthy) {
      logger.info('n8n connected');
    } else {
      logger.warn('n8n not reachable at startup', { error: n8nResult.error });
    }
  }

  // Start listening
  app.listen(env.port, () => {
    logger.info(`ContabilAI server running on port ${env.port} [${env.nodeEnv}]`);
    logger.info(`API: ${env.apiUrl}`);
    logger.info(`Frontend: ${env.frontendUrl}`);
  });
}

startServer().catch((err) => {
  logger.error('Failed to start server', { error: err.message, stack: err.stack });
  process.exit(1);
});

module.exports = app;
