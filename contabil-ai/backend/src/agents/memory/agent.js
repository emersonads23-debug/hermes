const { BaseAgent, AGENT_EVENTS } = require('../baseAgent');
const agentService = require('./agentService');

class MemoryAgent extends BaseAgent {
  constructor() {
    super('MemoryAgent');
  }

  async process(event) {
    switch (event.type) {
      case AGENT_EVENTS.MEMORY_UPDATE_REQUESTED:
        return this.onMemoryUpdateRequested(event);
      case AGENT_EVENTS.DOCUMENT_PROCESSED:
        return this.onDocumentProcessed(event);
      case AGENT_EVENTS.RECONCILIATION_COMPLETED:
        return this.onReconciliationCompleted(event);
      default:
        this.logger.warn(`[${this.name}] Unknown event type: ${event.type}`);
        return null;
    }
  }

  async onMemoryUpdateRequested(event) {
    const { companyId, updateType, data } = event;

    const result = await agentService.processMemoryUpdate(companyId, updateType, data);

    await this.emit(AGENT_EVENTS.MEMORY_LEARNED, {
      companyId,
      updateType,
      memoriesAffected: result.count,
    });

    return result;
  }

  async onDocumentProcessed(event) {
    const { companyId, classification, supplier, extractedData } = event;

    if (!companyId || !supplier) return null;

    return agentService.processMemoryUpdate(companyId, 'classification_confirmed', {
      supplier,
      classification,
      category: extractedData?.category,
    });
  }

  async onReconciliationCompleted(event) {
    const { companyId, supplier, amount, category, accountCode } = event;

    return agentService.processMemoryUpdate(companyId, 'reconciliation_confirmed', {
      description: supplier,
      category,
      accountCode,
      amount,
    });
  }
}

module.exports = new MemoryAgent();
