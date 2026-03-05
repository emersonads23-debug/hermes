const { BaseAgent, AGENT_EVENTS } = require('../baseAgent');
const agentService = require('./agentService');

class FinancialAgent extends BaseAgent {
  constructor() {
    super('FinancialAgent');
  }

  async process(event) {
    switch (event.type) {
      case AGENT_EVENTS.FINANCIAL_ANALYSIS_REQUESTED:
        return this.onAnalysisRequested(event);
      default:
        this.logger.warn(`[${this.name}] Unknown event type: ${event.type}`);
        return null;
    }
  }

  async onAnalysisRequested(event) {
    const { companyId, analysisType } = event;

    const result = await agentService.runAnalysis(companyId, analysisType, event.data);

    // If critical insights found, emit financial alerts
    if (result?.insights) {
      for (const insight of result.insights) {
        if (insight.severity === 'critical' || insight.severity === 'warning') {
          await this.emit(AGENT_EVENTS.FINANCIAL_ALERT, {
            companyId,
            alertType: insight.type,
            title: insight.title,
            message: insight.description,
            severity: insight.severity,
          });
        }
      }
    }

    return result;
  }
}

module.exports = new FinancialAgent();
