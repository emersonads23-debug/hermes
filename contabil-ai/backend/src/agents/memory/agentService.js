const logger = require('../../config/logger');

async function processMemoryUpdate(companyId, updateType, data) {
  const memoryEngine = require('../../memory/memoryEngine');
  const memoryService = require('../../memory/memoryService');

  switch (updateType) {
    case 'classification_confirmed': {
      await memoryEngine.onClassificationConfirmed(companyId, data);
      return { companyId, updateType, count: 1 };
    }

    case 'reconciliation_confirmed': {
      await memoryService.learnFromReconciliation(companyId, {
        description: data.description,
        category: data.category,
        accountCode: data.accountCode,
        amount: data.amount,
        source: 'agent_reconciliation',
      });
      return { companyId, updateType, count: 1 };
    }

    case 'risk_behavior': {
      await memoryService.learnFinancialBehavior(companyId, {
        behaviorKey: data.behaviorKey,
        behaviorData: data.behaviorData,
        source: 'risk_agent',
      });
      return { companyId, updateType, count: 1 };
    }

    case 'pattern_detection': {
      const learned = await memoryEngine.detectAndLearnPatterns(companyId, data.transactions || []);
      return { companyId, updateType, count: learned.length };
    }

    default:
      logger.warn('Unknown memory update type', { companyId, updateType });
      return { companyId, updateType, count: 0 };
  }
}

module.exports = {
  processMemoryUpdate,
};
