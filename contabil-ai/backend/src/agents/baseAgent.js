const logger = require('../config/logger');

// Base Agent class that all specialized agents extend
class BaseAgent {
  constructor(name) {
    this.name = name;
    this.logger = logger;
  }

  // Process an event dispatched by the orchestrator
  async handleEvent(event) {
    const startTime = Date.now();
    this.logger.info(`[${this.name}] Handling event`, { eventType: event.type, companyId: event.companyId });

    try {
      const result = await this.process(event);
      const duration = Date.now() - startTime;

      this.logger.info(`[${this.name}] Event processed`, {
        eventType: event.type,
        companyId: event.companyId,
        durationMs: duration,
      });

      return {
        agent: this.name,
        eventType: event.type,
        success: true,
        result,
        durationMs: duration,
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      this.logger.error(`[${this.name}] Event processing failed`, {
        eventType: event.type,
        companyId: event.companyId,
        error: err.message,
        durationMs: duration,
      });

      return {
        agent: this.name,
        eventType: event.type,
        success: false,
        error: err.message,
        durationMs: duration,
      };
    }
  }

  // Override in subclasses
  async process(_event) {
    throw new Error(`${this.name}: process() not implemented`);
  }

  // Emit a follow-up event to the orchestrator
  async emit(eventType, data) {
    const { addAgentEvent } = require('../queues');
    return addAgentEvent(eventType, data);
  }
}

// Event types used across the agent system
const AGENT_EVENTS = {
  DOCUMENT_RECEIVED: 'document_received',
  DOCUMENT_PROCESSED: 'document_processed',
  TRANSACTION_DETECTED: 'transaction_detected',
  RECONCILIATION_REQUESTED: 'reconciliation_requested',
  RECONCILIATION_COMPLETED: 'reconciliation_completed',
  ACCOUNTING_ENTRY_SUGGESTED: 'accounting_entry_suggested',
  FINANCIAL_ANALYSIS_REQUESTED: 'financial_analysis_requested',
  FINANCIAL_ALERT: 'financial_alert',
  RISK_DETECTED: 'risk_detected',
  MEMORY_UPDATE_REQUESTED: 'memory_update_requested',
  MEMORY_LEARNED: 'memory_learned',
};

module.exports = { BaseAgent, AGENT_EVENTS };
