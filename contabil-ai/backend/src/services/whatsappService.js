const axios = require('axios');
const crypto = require('crypto');
const env = require('../config/env');
const logger = require('../config/logger');

const REQUEST_TIMEOUT = 15000;

const api = axios.create({
  baseURL: env.evolution.apiUrl,
  headers: { apikey: env.evolution.apiKey },
  timeout: REQUEST_TIMEOUT,
});

// --- Webhook Signature Validation ---

function validateWebhookSignature(rawBody, signature) {
  if (!env.evolution.webhookSecret) return true; // skip if not configured
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

async function sendText(to, text) {
  try {
    const response = await api.post(`/message/sendText/${env.evolution.instanceName}`, {
      number: to,
      text,
    });
    logger.info('WhatsApp text sent', { to, messageId: response.data?.key?.id });
    return response.data;
  } catch (err) {
    logger.error('Failed to send WhatsApp text', {
      to,
      status: err.response?.status,
      error: err.response?.data || err.message,
    });
    throw err;
  }
}

async function sendFile(to, filePath, caption = '', mimeType = 'application/pdf') {
  try {
    const response = await api.post(`/message/sendMedia/${env.evolution.instanceName}`, {
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

async function sendReaction(to, messageId, emoji) {
  try {
    await api.post(`/message/sendReaction/${env.evolution.instanceName}`, {
      key: { remoteJid: `${to}@s.whatsapp.net`, id: messageId },
      reaction: emoji,
    });
  } catch (err) {
    logger.warn('Failed to send reaction', { to, error: err.message });
  }
}

// --- Media Download ---

async function downloadMedia(messageId) {
  try {
    const response = await api.get(
      `/chat/getBase64FromMediaMessage/${env.evolution.instanceName}`,
      { params: { messageId }, timeout: 30000 }
    );
    return response.data;
  } catch (err) {
    logger.error('Failed to download media', { messageId, error: err.message });
    throw err;
  }
}

// --- Instance Management ---

async function getInstanceStatus() {
  try {
    const response = await api.get(`/instance/connectionState/${env.evolution.instanceName}`);
    return response.data;
  } catch (err) {
    logger.error('Failed to get instance status', { error: err.message });
    return { state: 'unknown', error: err.message };
  }
}

async function createInstance() {
  try {
    const response = await api.post('/instance/create', {
      instanceName: env.evolution.instanceName,
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
    logger.info('Evolution instance created', { instance: env.evolution.instanceName });
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
};
