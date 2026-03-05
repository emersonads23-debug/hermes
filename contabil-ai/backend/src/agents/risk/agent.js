const { BaseAgent, AGENT_EVENTS } = require('../baseAgent');
const agentService = require('./agentService');

class RiskAgent extends BaseAgent {
  constructor() {
    super('RiskAgent');
  }

  async process(event) {
    switch (event.type) {
      case AGENT_EVENTS.FINANCIAL_ALERT:
        return this.onFinancialAlert(event);
      case AGENT_EVENTS.RISK_DETECTED:
        return this.onRiskDetected(event);
      default:
        this.logger.warn(`[${this.name}] Unknown event type: ${event.type}`);
        return null;
    }
  }

  async onFinancialAlert(event) {
    const { companyId, alertType, title, message, severity } = event;

    const assessment = await agentService.assessRisk(companyId, {
      alertType,
      title,
      message,
      severity,
    });

    // If risk is confirmed critical, send alert and request memory update
    if (assessment.confirmed && assessment.severity === 'critical') {
      await agentService.sendAlert(companyId, assessment);

      await this.emit(AGENT_EVENTS.MEMORY_UPDATE_REQUESTED, {
        companyId,
        updateType: 'risk_behavior',
        data: {
          behaviorKey: `risk_${alertType}`,
          behaviorData: { severity, title, detected_at: new Date().toISOString() },
        },
      });
    }

    return assessment;
  }

  async onRiskDetected(event) {
    const { companyId } = event;
    return agentService.evaluateCompanyRisks(companyId);
  }
}

module.exports = new RiskAgent();
