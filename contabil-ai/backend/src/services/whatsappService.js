const axios = require('axios');
const crypto = require('crypto');
const env = require('../config/env');
const logger = require('../config/logger');

const REQUEST_TIMEOUT = 15000;

// Default API client (global/env config)
const api = axios.create({
  baseURL: env.evolution.apiUrl,
  headers: { apikey: env.evolution.apiKey },
  timeout: REQUEST_TIMEOUT,
});

// Create an API client for a specific office's Evolution instance
function getOfficeApi(office) {
  if (office && office.evolution_instance_url && office.evolution_api_key) {
    return axios.create({
      baseURL: office.evolution_instance_url,
      headers: { apikey: office.evolution_api_key },
      timeout: REQUEST_TIMEOUT,
    });
  }
  return api;
}

function getInstanceName(office) {
  if (office && office.evolution_instance_name) {
    return office.evolution_instance_name;
  }
  return env.evolution.instanceName;
}

// --- Webhook Signature Validation ---

function validateWebhookSignature(rawBody, signature) {
  if (!env.evolution.webhookSecret) {
    if (env.nodeEnv === 'production') {
      logger.error('Webhook secret not configured in production. Rejecting request.');
      return false;
    }
    logger.warn('Webhook secret not configured. Skipping signature validation in development.');
    return true;
  }
  if (!signature) return false;

  const expected = crypto
    .createHmac('sha256', env.evolution.webhookSecret)
    .update(rawBody)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex')
  );
}

// --- Webhook Event Parsing ---

function parseWebhookEvent(body) {
  const event = body.event;
  const instance = body.instance;

  // Normalize different Evolution API payload shapes
  const data = body.data || body;

  if (event === 'messages.upsert') {
    const message = data.message || data;
    const key = data.key || message.key;

    if (!key || !key.remoteJid) {
      return { type: 'unknown', raw: body };
    }

    // Skip status messages, group messages, own messages
    if (key.remoteJid === 'status@broadcast') return { type: 'status_broadcast' };
    if (key.remoteJid.endsWith('@g.us')) return { type: 'group_message' };
    if (key.fromMe) return { type: 'own_message' };

    const phone = key.remoteJid.replace('@s.whatsapp.net', '');
    const messageId = key.id;

    let messageType = 'text';
    if (message.audioMessage) messageType = 'audio';
    else if (message.imageMessage) messageType = 'image';
    else if (message.documentMessage) messageType = 'document';
    else if (message.videoMessage) messageType = 'video';
    else if (message.stickerMessage) messageType = 'sticker';
    else if (message.contactMessage) messageType = 'contact';
    else if (message.locationMessage) messageType = 'location';

    return {
      type: 'message',
      phone,
      messageId,
      messageType,
      message,
      instance,
    };
  }

  if (event === 'connection.update') {
    return {
      type: 'connection_update',
      state: data.state,
      statusReason: data.statusReason,
      instance,
    };
  }

  if (event === 'qrcode.updated') {
    return { type: 'qrcode', base64: data.qrcode?.base64, instance };
  }

  return { type: event || 'unknown', raw: body };
}

// --- Send Messages ---
// All send functions accept an optional `office` parameter to use per-office instances

async function sendText(to, text, office = null) {
  const client = getOfficeApi(office);
  const instanceName = getInstanceName(office);
  try {
    const response = await client.post(`/message/sendText/${instanceName}`, {
      number: to,
      text,
    });
    logger.info('WhatsApp text sent', { to, messageId: response.data?.key?.id, instance: instanceName });
    return response.data;
  } catch (err) {
    logger.error('Failed to send WhatsApp text', {
      to,
      instance: instanceName,
      status: err.response?.status,
      error: err.response?.data || err.message,
    });
    throw err;
  }
}

async function sendFile(to, filePath, caption = '', mimeType = 'application/pdf', office = null) {
  const client = getOfficeApi(office);
  const instanceName = getInstanceName(office);
  try {
    const response = await client.post(`/message/sendMedia/${instanceName}`, {
      number: to,
      mediatype: 'document',
      mimetype: mimeType,
      media: filePath,
      caption,
    });
    return response.data;
  } catch (err) {
    logger.error('Failed to send WhatsApp file', { to, error: err.message });
    throw err;
  }
}

async function sendReaction(to, messageId, emoji, office = null) {
  const client = getOfficeApi(office);
  const instanceName = getInstanceName(office);
  try {
    await client.post(`/message/sendReaction/${instanceName}`, {
      key: { remoteJid: `${to}@s.whatsapp.net`, id: messageId },
      reaction: emoji,
    });
  } catch (err) {
    logger.warn('Failed to send reaction', { to, error: err.message });
  }
}

// --- Media Download ---

async function downloadMedia(messageId, office = null) {
  const client = getOfficeApi(office);
  const instanceName = getInstanceName(office);
  try {
    const response = await client.get(
      `/chat/getBase64FromMediaMessage/${instanceName}`,
      { params: { messageId }, timeout: 30000 }
    );
    return response.data;
  } catch (err) {
    logger.error('Failed to download media', { messageId, error: err.message });
    throw err;
  }
}

// --- Instance Management ---

async function getInstanceStatus(office = null) {
  const client = getOfficeApi(office);
  const instanceName = getInstanceName(office);
  try {
    const response = await client.get(`/instance/connectionState/${instanceName}`);
    return response.data;
  } catch (err) {
    logger.error('Failed to get instance status', { instance: instanceName, error: err.message });
    return { state: 'unknown', error: err.message };
  }
}

async function createInstance(office = null) {
  const client = getOfficeApi(office);
  const instanceName = getInstanceName(office);
  try {
    const response = await client.post('/instance/create', {
      instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
      webhook: `${env.apiUrl}/api/webhook/evolution`,
      webhookByEvents: true,
      webhookBase64: true,
      events: [
        'messages.upsert',
        'connection.update',
        'qrcode.updated',
      ],
    });
    logger.info('Evolution instance created', { instance: instanceName });
    return response.data;
  } catch (err) {
    // Instance may already exist
    if (err.response?.status === 403 || err.response?.status === 409) {
      logger.info('Evolution instance already exists');
      return { existing: true };
    }
    throw err;
  }
}

async function healthCheck() {
  try {
    const status = await getInstanceStatus();
    return {
      healthy: status.state === 'open',
      provider: 'evolution',
      state: status.state,
      instance: env.evolution.instanceName,
    };
  } catch (err) {
    return { healthy: false, provider: 'evolution', error: err.message };
  }
}

module.exports = {
  validateWebhookSignature,
  parseWebhookEvent,
  sendText,
  sendFile,
  sendReaction,
  downloadMedia,
  getInstanceStatus,
  createInstance,
  healthCheck,
  getOfficeApi,
  getInstanceName,
};
