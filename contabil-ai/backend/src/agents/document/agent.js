const { BaseAgent, AGENT_EVENTS } = require('../baseAgent');
const agentService = require('./agentService');

class DocumentAgent extends BaseAgent {
  constructor() {
    super('DocumentAgent');
  }

  async process(event) {
    switch (event.type) {
      case AGENT_EVENTS.DOCUMENT_RECEIVED:
        return this.onDocumentReceived(event);
      default:
        this.logger.warn(`[${this.name}] Unknown event type: ${event.type}`);
        return null;
    }
  }

  async onDocumentReceived(event) {
    const { documentId, companyId } = event;

    const result = await agentService.processDocument(documentId);

    // Emit document_processed event for other agents
    await this.emit(AGENT_EVENTS.DOCUMENT_PROCESSED, {
      companyId,
      documentId,
      classification: result.classification,
      confidence: result.classification_confidence,
      extractedData: result.extracted_data,
      supplier: result.supplier,
      amount: result.amount,
      needsReview: result.processing_status === 'needs_review',
    });

    // If a transaction was extracted, notify reconciliation agent
    if (result.amount && result.supplier) {
      await this.emit(AGENT_EVENTS.TRANSACTION_DETECTED, {
        companyId,
        documentId,
        supplier: result.supplier,
        amount: result.amount,
        date: result.document_date,
        classification: result.classification,
        source: 'document',
      });
    }

    return result;
  }
}

module.exports = new DocumentAgent();
