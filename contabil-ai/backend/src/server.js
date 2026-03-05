const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const env = require('./config/env');
const logger = require('./config/logger');
const { requestTracing } = require('./config/logger');
const errorHandler = require('./middleware/errorHandler');
const { globalLimiter, authLimiter, webhookLimiter, integrationLimiter, tenantLimiter } = require('./middleware/rateLimiter');

const authRoutes = require('./routes/auth');
const officeRoutes = require('./routes/offices');
const companyRoutes = require('./routes/companies');
const userRoutes = require('./routes/users');
const webhookRoutes = require('./routes/webhook');
const integrationRoutes = require('./routes/integrations');
const escalationRoutes = require('./routes/escalations');
const taskRoutes = require('./routes/tasks');
const financialRoutes = require('./routes/financial');
const copilotRoutes = require('./routes/copilot');
const memoryRoutes = require('./routes/memory');

const app = express();

// Ensure required directories exist
for (const dir of [path.resolve(env.upload.dir), path.resolve('logs')]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Security
app.use(helmet());
app.use(cors({ origin: env.frontendUrl, credentials: true }));

// Request tracing (assigns requestId, logs request/response)
app.use(requestTracing);

// Global rate limiting
app.use('/api/', globalLimiter);

// Webhook route with larger body limit and higher rate limit
app.use('/api/webhook', webhookLimiter, express.json({ limit: '50mb' }), webhookRoutes);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// API routes with per-route rate limiting
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/offices', tenantLimiter, officeRoutes);
app.use('/api/companies', tenantLimiter, companyRoutes);
app.use('/api/users', tenantLimiter, userRoutes);
app.use('/api/integrations', integrationLimiter, integrationRoutes);
app.use('/api/escalations', tenantLimiter, escalationRoutes);
app.use('/api/tasks', tenantLimiter, taskRoutes);
app.use('/api/financial', tenantLimiter, financialRoutes);
app.use('/api/copilot', tenantLimiter, copilotRoutes);
app.use('/api/memory', tenantLimiter, memoryRoutes);

// Health check endpoint — checks all integration statuses
app.get('/api/health', async (_req, res) => {
  const { healthCheck: supabaseHealth } = require('./config/supabase');
  const whatsappService = require('./services/whatsappService');
  const n8nService = require('./services/n8nService');

  let queueStats = null;
  if (process.env.REDIS_HOST || process.env.REDIS_URL) {
    try {
      const { getQueueStats } = require('./queues');
      queueStats = await getQueueStats();
    } catch { /* Redis not available */ }
  }

  const [db, whatsapp, n8n] = await Promise.allSettled([
    supabaseHealth(),
    whatsappService.healthCheck(),
    n8nService.healthCheck(),
  ]);

  const checks = {
    database: db.status === 'fulfilled' ? db.value : { healthy: false, error: db.reason?.message },
    whatsapp: whatsapp.status === 'fulfilled' ? whatsapp.value : { healthy: false, error: whatsapp.reason?.message },
    n8n: n8n.status === 'fulfilled' ? n8n.value : { healthy: false, error: n8n.reason?.message },
    queues: queueStats || { healthy: false, error: 'Redis not configured' },
  };

  const allHealthy = Object.values(checks).every((c) => c.healthy);

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services: checks,
  });
});

// Queue stats endpoint
app.get('/api/queues/stats', async (_req, res) => {
  if (!process.env.REDIS_HOST && !process.env.REDIS_URL) {
    return res.json({ configured: false });
  }
  try {
    const { getQueueStats } = require('./queues');
    const stats = await getQueueStats();
    res.json({ configured: true, queues: stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

  // Start queue workers (if Redis is available)
  if (process.env.REDIS_HOST || process.env.REDIS_URL) {
    try {
      const { startWorkers } = require('./queues/workers');
      startWorkers();
      logger.info('Queue workers started');
    } catch (err) {
      logger.warn('Queue workers failed to start (Redis may not be available)', { error: err.message });
    }
  }

  // Start listening
  const server = app.listen(env.port, () => {
    logger.info(`ContabilAI server running on port ${env.port} [${env.nodeEnv}]`);
    logger.info(`API: ${env.apiUrl}`);
    logger.info(`Frontend: ${env.frontendUrl}`);
  });

  // Graceful shutdown
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, async () => {
      logger.info(`${signal} received, shutting down gracefully...`);
      server.close();
      try {
        const { closeAll } = require('./queues');
        await closeAll();
      } catch { /* ignore */ }
      try {
        const { close } = require('./config/database');
        await close();
      } catch { /* ignore */ }
      process.exit(0);
    });
  }
}

startServer().catch((err) => {
  logger.error('Failed to start server', { error: err.message, stack: err.stack });
  process.exit(1);
});

module.exports = app;
