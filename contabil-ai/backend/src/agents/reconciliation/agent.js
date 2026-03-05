const { BaseAgent, AGENT_EVENTS } = require('../baseAgent');
const agentService = require('./agentService');

class ReconciliationAgent extends BaseAgent {
  constructor() {
    super('ReconciliationAgent');
  }

  async process(event) {
    switch (event.type) {
      case AGENT_EVENTS.TRANSACTION_DETECTED:
        return this.onTransactionDetected(event);
      case AGENT_EVENTS.RECONCILIATION_REQUESTED:
        return this.onReconciliationRequested(event);
      default:
        this.logger.warn(`[${this.name}] Unknown event type: ${event.type}`);
        return null;
    }
  }

  async onTransactionDetected(event) {
    const { companyId, supplier, amount, date, classification, documentId } = event;

    const match = await agentService.findMatchingTransaction(companyId, { supplier, amount, date });

    if (match) {
      const reconciliation = await agentService.reconcile(companyId, {
        documentId,
        transactionId: match.id,
        supplier,
        amount,
        classification,
      });

      await this.emit(AGENT_EVENTS.RECONCILIATION_COMPLETED, {
        companyId,
        documentId,
        transactionId: match.id,
        supplier,
        amount,
        category: reconciliation.category,
        accountCode: reconciliation.accountCode,
      });

      return reconciliation;
    }

    // No match — create candidate for manual review
    return agentService.createReconciliationCandidate(companyId, {
      documentId,
      supplier,
      amount,
      date,
      classification,
    });
  }

  async onReconciliationRequested(event) {
    const { companyId, documentId, transactionId } = event;
    return agentService.reconcileManual(companyId, documentId, transactionId);
  }
}

module.exports = new ReconciliationAgent();
