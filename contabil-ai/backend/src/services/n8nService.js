const axios = require('axios');
const env = require('../config/env');
const logger = require('../config/logger');

const REQUEST_TIMEOUT = 10000;

// Map of workflow names to their n8n webhook paths
const WORKFLOW_PATHS = {
  'evolution-webhook': '/webhook/evolution-webhook',
  'escalation-notify': '/webhook/escalation-notify',
  'connection-update': '/webhook/connection-update',
  'message-processed': '/webhook/message-processed',
  'daily-report': '/webhook/daily-report',
};

async function triggerWorkflow(workflowName, payload = {}) {
  const webhookPath = WORKFLOW_PATHS[workflowName];
  if (!webhookPath) {
    logger.warn('Unknown n8n workflow', { workflowName });
    return null;
  }

  if (!env.n8n.webhookUrl) {
    logger.debug('n8n webhook URL not configured, skipping trigger', { workflowName });
    return null;
  }

  const url = `${env.n8n.webhookUrl}${webhookPath}`;

  try {
    const response = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: REQUEST_TIMEOUT,
    });
    logger.info('n8n workflow triggered', { workflowName, status: response.status });
    return response.data;
  } catch (err) {
    // n8n webhook failures should not break the main flow
    logger.warn('n8n workflow trigger failed', {
      workflowName,
      url,
      status: err.response?.status,
      error: err.response?.data || err.message,
    });
    return null;
  }
}

async function triggerEscalationNotification({ email, subject, phone, description, taskId }) {
  return triggerWorkflow('escalation-notify', {
    email,
    subject,
    phone,
    description,
    taskId,
    timestamp: new Date().toISOString(),
  });
}

async function healthCheck() {
  if (!env.n8n.webhookUrl) {
    return { healthy: false, provider: 'n8n', error: 'N8N_WEBHOOK_URL not configured' };
  }

  try {
    // n8n exposes a health endpoint
    const baseUrl = env.n8n.webhookUrl.replace('/webhook', '');
    const response = await axios.get(`${baseUrl}/healthz`, { timeout: 5000 });
    return {
      healthy: response.status === 200,
      provider: 'n8n',
      status: response.data?.status || 'ok',
    };
  } catch (err) {
    return { healthy: false, provider: 'n8n', error: err.message };
  }
}

module.exports = {
  triggerWorkflow,
  triggerEscalationNotification,
  healthCheck,
  WORKFLOW_PATHS,
};
