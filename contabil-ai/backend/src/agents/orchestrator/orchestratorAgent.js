const logger = require('../../config/logger');
const { AGENT_EVENTS } = require('../baseAgent');

// Maps event types to the agent queues that should handle them
const EVENT_ROUTING = {
  [AGENT_EVENTS.DOCUMENT_RECEIVED]: ['document_agent_queue'],
  [AGENT_EVENTS.DOCUMENT_PROCESSED]: ['accounting_agent_queue', 'memory_agent_queue'],
  [AGENT_EVENTS.TRANSACTION_DETECTED]: ['reconciliation_agent_queue'],
  [AGENT_EVENTS.RECONCILIATION_REQUESTED]: ['reconciliation_agent_queue'],
  [AGENT_EVENTS.RECONCILIATION_COMPLETED]: ['accounting_agent_queue', 'memory_agent_queue'],
  [AGENT_EVENTS.ACCOUNTING_ENTRY_SUGGESTED]: [],
  [AGENT_EVENTS.FINANCIAL_ANALYSIS_REQUESTED]: ['financial_agent_queue'],
  [AGENT_EVENTS.FINANCIAL_ALERT]: ['risk_agent_queue'],
  [AGENT_EVENTS.RISK_DETECTED]: ['risk_agent_queue'],
  [AGENT_EVENTS.MEMORY_UPDATE_REQUESTED]: ['memory_agent_queue'],
  [AGENT_EVENTS.MEMORY_LEARNED]: [],
};

// Dispatch an event to the appropriate agent queues
async function dispatch(eventType, eventData) {
  const targetQueues = EVENT_ROUTING[eventType];

  if (!targetQueues) {
    logger.warn('Orchestrator: no routing for event', { eventType });
    return [];
  }

  if (targetQueues.length === 0) {
    logger.debug('Orchestrator: event has no subscribers', { eventType });
    return [];
  }

  const { getQueue } = require('../../queues');
  const results = [];

  for (const queueName of targetQueues) {
    try {
      const queue = getQueue(queueName);
      const job = await queue.add(eventType, {
        type: eventType,
        ...eventData,
        _orchestratorTimestamp: Date.now(),
      });
      results.push({ queue: queueName, jobId: job.id });
      logger.info('Orchestrator dispatched event', { eventType, queue: queueName, jobId: job.id });
    } catch (err) {
      logger.error('Orchestrator dispatch failed', { eventType, queue: queueName, error: err.message });
    }
  }

  return results;
}

// Receive an event from any source and route it
async function receiveEvent(eventType, eventData) {
  logger.info('Orchestrator received event', {
    eventType,
    companyId: eventData.companyId,
    source: eventData._source || 'unknown',
  });

  return dispatch(eventType, eventData);
}

// Get the routing table (for debugging/dashboard)
function getRoutingTable() {
  return EVENT_ROUTING;
}

// Get all registered agent queue names
function getAgentQueues() {
  return [
    'document_agent_queue',
    'reconciliation_agent_queue',
    'accounting_agent_queue',
    'financial_agent_queue',
    'risk_agent_queue',
    'memory_agent_queue',
  ];
}

module.exports = {
  dispatch,
  receiveEvent,
  getRoutingTable,
  getAgentQueues,
  EVENT_ROUTING,
};
