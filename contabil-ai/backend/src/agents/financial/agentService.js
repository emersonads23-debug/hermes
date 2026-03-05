const financialAgentLegacy = require('../financialAgent');
const logger = require('../../config/logger');

async function runAnalysis(companyId, analysisType, data = {}) {
  switch (analysisType) {
    case 'cash-flow':
      return financialAgentLegacy.analyzeCashFlow(companyId, data);

    case 'revenue-trends': {
      const financialMemory = require('../../analysis/financialMemory');
      const snapshots = await financialMemory.getSnapshots(companyId, { days: 180 });
      return financialAgentLegacy.analyzeRevenueTrends(companyId, snapshots);
    }

    case 'receivable-aging':
      return financialAgentLegacy.analyzeReceivableAging(companyId, data.receivables || []);

    case 'payable-forecast':
      return financialAgentLegacy.analyzePayableForecast(companyId, data.payables || []);

    case 'summary': {
      const financialMemory = require('../../analysis/financialMemory');
      const context = await financialMemory.getCompanyFinancialContext(companyId);
      if (context.latestSnapshot) {
        return financialAgentLegacy.generateFinancialSummary(companyId, context.latestSnapshot);
      }
      return { skipped: true, reason: 'no_snapshot' };
    }

    default:
      logger.warn('Unknown analysis type in FinancialAgent', { analysisType });
      return null;
  }
}

module.exports = {
  runAnalysis,
};
