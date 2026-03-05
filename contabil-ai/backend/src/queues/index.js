const { Queue, Worker, QueueEvents } = require('bullmq');
const logger = require('../config/logger');

const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

// Queue definitions
const QUEUES = {
  MESSAGE_PROCESSING: 'message_processing',
  DOCUMENT_PROCESSING: 'document_processing',
  FINANCIAL_ANALYSIS: 'financial_analysis',
  COPILOT_ANALYSIS: 'copilot_analysis',
  MEMORY_LEARNING: 'memory_learning',
  ALERTS: 'alerts',
  // Agent queues
  DOCUMENT_AGENT: 'document_agent_queue',
  RECONCILIATION_AGENT: 'reconciliation_agent_queue',
  ACCOUNTING_AGENT: 'accounting_agent_queue',
  FINANCIAL_AGENT: 'financial_agent_queue',
  RISK_AGENT: 'risk_agent_queue',
  MEMORY_AGENT: 'memory_agent_queue',
};

const queues = {};
const workers = {};

function getQueue(name) {
  if (!queues[name]) {
    queues[name] = new Queue(name, {
      connection: REDIS_CONFIG,
      defaultJobOptions: {
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    });
    logger.info('Queue created', { queue: name });
  }
  return queues[name];
}

function registerWorker(queueName, processor, concurrency = 3) {
  if (workers[queueName]) {
    logger.warn('Worker already registered', { queue: queueName });
    return workers[queueName];
  }

  const worker = new Worker(queueName, processor, {
    connection: REDIS_CONFIG,
    concurrency,
    limiter: { max: 10, duration: 1000 },
  });

  worker.on('completed', (job) => {
    logger.info('Job completed', { queue: queueName, jobId: job.id, name: job.name });
  });

  worker.on('failed', (job, err) => {
    logger.error('Job failed', {
      queue: queueName,
      jobId: job?.id,
      name: job?.name,
      error: err.message,
      attempt: job?.attemptsMade,
    });
  });

  worker.on('error', (err) => {
    logger.error('Worker error', { queue: queueName, error: err.message });
  });

  workers[queueName] = worker;
  logger.info('Worker registered', { queue: queueName, concurrency });
  return worker;
}

// Convenience methods for adding jobs
async function addMessageJob(data) {
  return getQueue(QUEUES.MESSAGE_PROCESSING).add('process-message', data, {
    priority: 1,
  });
}

async function addDocumentJob(documentId, data = {}) {
  return getQueue(QUEUES.DOCUMENT_PROCESSING).add('process-document', {
    documentId,
    ...data,
  });
}

async function addFinancialAnalysisJob(companyId, analysisType, data = {}) {
  return getQueue(QUEUES.FINANCIAL_ANALYSIS).add(analysisType, {
    companyId,
    ...data,
  });
}

async function addCopilotJob(companyId, triggerType = 'daily', data = {}) {
  return getQueue(QUEUES.COPILOT_ANALYSIS).add('copilot-evaluate', {
    companyId,
    triggerType,
    ...data,
  });
}

async function addMemoryLearningJob(jobType = 'daily', data = {}) {
  return getQueue(QUEUES.MEMORY_LEARNING).add(jobType, data);
}

async function addAgentEvent(eventType, eventData) {
  const orchestrator = require('../agents/orchestrator/orchestratorAgent');
  return orchestrator.receiveEvent(eventType, eventData);
}

async function addAlertJob(alertData) {
  return getQueue(QUEUES.ALERTS).add('send-alert', alertData, {
    priority: alertData.severity === 'critical' ? 1 : 3,
  });
}

async function getQueueStats() {
  const stats = {};
  for (const [key, name] of Object.entries(QUEUES)) {
    const q = getQueue(name);
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      q.getWaitingCount(),
      q.getActiveCount(),
      q.getCompletedCount(),
      q.getFailedCount(),
      q.getDelayedCount(),
    ]);
    stats[key] = { waiting, active, completed, failed, delayed };
  }
  return stats;
}

async function closeAll() {
  for (const w of Object.values(workers)) {
    await w.close();
  }
  for (const q of Object.values(queues)) {
    await q.close();
  }
  logger.info('All queues and workers closed');
}

module.exports = {
  QUEUES,
  getQueue,
  registerWorker,
  addMessageJob,
  addDocumentJob,
  addFinancialAnalysisJob,
  addCopilotJob,
  addMemoryLearningJob,
  addAgentEvent,
  addAlertJob,
  getQueueStats,
  closeAll,
};
