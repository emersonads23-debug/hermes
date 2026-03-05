const { BaseAgent, AGENT_EVENTS } = require('../baseAgent');
const agentService = require('./agentService');

class AccountingAgent extends BaseAgent {
  constructor() {
    super('AccountingAgent');
  }

  async process(event) {
    switch (event.type) {
      case AGENT_EVENTS.RECONCILIATION_COMPLETED:
        return this.onReconciliationCompleted(event);
      case AGENT_EVENTS.DOCUMENT_PROCESSED:
        return this.onDocumentProcessed(event);
      default:
        this.logger.warn(`[${this.name}] Unknown event type: ${event.type}`);
        return null;
    }
  }

  async onReconciliationCompleted(event) {
    const { companyId, supplier, amount, category, accountCode } = event;

    const entry = await agentService.suggestAccountingEntry(companyId, {
      supplier,
      amount,
      category,
      accountCode,
      source: 'reconciliation',
    });

    await this.emit(AGENT_EVENTS.ACCOUNTING_ENTRY_SUGGESTED, {
      companyId,
      entry,
    });

    // Notify memory agent to learn from this accounting decision
    await this.emit(AGENT_EVENTS.MEMORY_UPDATE_REQUESTED, {
      companyId,
      updateType: 'reconciliation_confirmed',
      data: { description: supplier, category, accountCode, amount },
    });

    return entry;
  }

  async onDocumentProcessed(event) {
    const { companyId, classification, extractedData, supplier, amount } = event;

    if (!amount || event.needsReview) return null;

    return agentService.suggestAccountingEntry(companyId, {
      supplier,
      amount,
      category: classification,
      source: 'document',
      extractedData,
    });
  }
}

module.exports = new AccountingAgent();
