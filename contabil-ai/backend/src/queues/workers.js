const { registerWorker, QUEUES, addAlertJob } = require('./index');
const logger = require('../config/logger');

function startWorkers() {
  // Message processing worker
  registerWorker(QUEUES.MESSAGE_PROCESSING, async (job) => {
    const { phone, messageType, content, officeId, companyId } = job.data;
    logger.info('Processing message', { jobId: job.id, phone, messageType });

    const aiService = require('../services/aiService');

    if (messageType === 'text') {
      const intent = await aiService.classifyIntent(content);
      const response = await aiService.interpretMessage(content);
      return { intent, response };
    }

    return { processed: true };
  }, 5);

  // Document processing worker
  registerWorker(QUEUES.DOCUMENT_PROCESSING, async (job) => {
    const { documentId } = job.data;
    logger.info('Processing document', { jobId: job.id, documentId });

    const documentIntelligence = require('../ocr/documentIntelligence');
    return documentIntelligence.processDocument(documentId);
  }, 3);

  // Financial analysis worker
  registerWorker(QUEUES.FINANCIAL_ANALYSIS, async (job) => {
    const { companyId } = job.data;
    logger.info('Running financial analysis', { jobId: job.id, type: job.name, companyId });

    const financialAgent = require('../agents/financialAgent');
    const financialMemory = require('../analysis/financialMemory');

    switch (job.name) {
      case 'daily-analysis': {
        const context = await financialMemory.getCompanyFinancialContext(companyId);
        if (context.latestSnapshot) {
          const result = await financialAgent.generateFinancialSummary(companyId, context.latestSnapshot);

          // Send critical alerts
          if (result.insights) {
            for (const insight of result.insights) {
              if (insight.severity === 'critical') {
                await addAlertJob({
                  companyId,
                  alertType: insight.type,
                  title: insight.title,
                  message: insight.description,
                  severity: 'critical',
                });
              }
            }
          }
          return result;
        }
        return { skipped: true, reason: 'no_snapshot' };
      }

      case 'cash-flow':
        return financialAgent.analyzeCashFlow(companyId, job.data);

      case 'revenue-trends': {
        const snapshots = await financialMemory.getSnapshots(companyId, { days: 180 });
        return financialAgent.analyzeRevenueTrends(companyId, snapshots);
      }

      case 'detect-patterns':
        return financialMemory.detectPatterns(companyId);

      default:
        logger.warn('Unknown analysis type', { type: job.name });
        return null;
    }
  }, 2);

  // Copilot analysis worker
  registerWorker(QUEUES.COPILOT_ANALYSIS, async (job) => {
    const { companyId, triggerType } = job.data;
    logger.info('Running copilot evaluation', { jobId: job.id, companyId, triggerType });

    const copilotEngine = require('../copilot/copilotEngine');
    return copilotEngine.evaluateCompany(companyId, triggerType);
  }, 2);

  // Memory learning worker
  registerWorker(QUEUES.MEMORY_LEARNING, async (job) => {
    logger.info('Running memory learning job', { jobId: job.id, type: job.name });

    const memoryLearning = require('../memory/memoryLearning');

    switch (job.name) {
      case 'daily':
        return memoryLearning.runDailyLearningJob();

      case 'detect-patterns': {
        const { companyId, transactions } = job.data;
        return memoryLearning.detectSupplierPatterns(companyId, transactions);
      }

      default:
        return memoryLearning.runDailyLearningJob();
    }
  }, 1);

  // Alert delivery worker
  registerWorker(QUEUES.ALERTS, async (job) => {
    const alertEngine = require('../alerts/alertEngine');
    return alertEngine.deliverAlert(job.data);
  }, 5);

  // === Multi-Agent Workers ===

  // Document Agent worker
  registerWorker(QUEUES.DOCUMENT_AGENT, async (job) => {
    logger.info('DocumentAgent processing', { jobId: job.id, type: job.name });
    const { handleJob } = require('../agents/document/agentHandlers');
    return handleJob(job);
  }, 3);

  // Reconciliation Agent worker
  registerWorker(QUEUES.RECONCILIATION_AGENT, async (job) => {
    logger.info('ReconciliationAgent processing', { jobId: job.id, type: job.name });
    const { handleJob } = require('../agents/reconciliation/agentHandlers');
    return handleJob(job);
  }, 2);

  // Accounting Agent worker
  registerWorker(QUEUES.ACCOUNTING_AGENT, async (job) => {
    logger.info('AccountingAgent processing', { jobId: job.id, type: job.name });
    const { handleJob } = require('../agents/accounting/agentHandlers');
    return handleJob(job);
  }, 2);

  // Financial Agent worker
  registerWorker(QUEUES.FINANCIAL_AGENT, async (job) => {
    logger.info('FinancialAgent processing', { jobId: job.id, type: job.name });
    const { handleJob } = require('../agents/financial/agentHandlers');
    return handleJob(job);
  }, 2);

  // Risk Agent worker
  registerWorker(QUEUES.RISK_AGENT, async (job) => {
    logger.info('RiskAgent processing', { jobId: job.id, type: job.name });
    const { handleJob } = require('../agents/risk/agentHandlers');
    return handleJob(job);
  }, 2);

  // Memory Agent worker
  registerWorker(QUEUES.MEMORY_AGENT, async (job) => {
    logger.info('MemoryAgent processing', { jobId: job.id, type: job.name });
    const { handleJob } = require('../agents/memory/agentHandlers');
    return handleJob(job);
  }, 2);

  logger.info('All queue workers started (including multi-agent workers)');
}

module.exports = { startWorkers };
