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

  if (event === 'messages.upsert' || event === 'MESSAGES_UPSERT') {
    const message = data.message || data;
    const key = data.key || message.key;

    if (!key || !key.remoteJid) {
      return { type: 'unknown', raw: body };
    }

    // Skip status messages, group messages, own messages
    if (key.remoteJid === 'status@broadcast') return { type: 'status_broadcast' };
    if (key.remoteJid.endsWith('@g.us')) return { type: 'group_message' };
    if (key.fromMe) return { type: 'own_message' };

    // Skip LID (Linked Device ID) messages — not a real phone number
    if (key.remoteJid.endsWith('@lid')) {
      logger.info('Skipping LID message, checking for phone in pushName/participant', {
        remoteJid: key.remoteJid,
        participant: data.participant,
        pushName: data.pushName,
      });
      // Try to get the real phone from participant field
      const participant = data.participant || key.participant;
      if (participant && participant.includes('@s.whatsapp.net')) {
        // Use participant as the real phone
        const phone = participant.replace('@s.whatsapp.net', '');
        const messageId = key.id;

        let messageType = 'text';
        if (message.audioMessage) messageType = 'audio';
        else if (message.imageMessage) messageType = 'image';
        else if (message.documentMessage) messageType = 'document';
        else if (message.videoMessage) messageType = 'video';
        else if (message.stickerMessage) messageType = 'sticker';

        return { type: 'message', phone, messageId, messageType, message, instance };
      }
      return { type: 'lid_message', raw: body };
    }

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

  if (event === 'connection.update' || event === 'CONNECTION_UPDATE') {
    return {
      type: 'connection_update',
      state: data.state,
      statusReason: data.statusReason,
      instance,
    };
  }

  if (event === 'qrcode.updated' || event === 'QRCODE_UPDATED') {
    return { type: 'qrcode', base64: data.qrcode?.base64, instance };
  }

  return { type: event || 'unknown', raw: body };
}

// --- Send Messages (Evolution v1.8 format) ---

async function sendText(to, text, instanceName) {
  const instance = instanceName || env.evolution.instanceName;
  try {
    const response = await api.post(`/message/sendText/${instance}`, {
      number: to,
      textMessage: { text },
    });
    logger.info('WhatsApp text sent', { to, instance, messageId: response.data?.key?.id });
    return response.data;
  } catch (err) {
    logger.error('Failed to send WhatsApp text', {
      to,
      instance,
      status: err.response?.status,
      error: err.response?.data || err.message,
    });
    throw err;
  }
}

async function sendFile(to, filePath, caption = '', mimeType = 'application/pdf', instanceName) {
  const instance = instanceName || env.evolution.instanceName;
  try {
    const response = await api.post(`/message/sendMedia/${instance}`, {
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

async function sendReaction(to, messageId, emoji, instanceName) {
  const instance = instanceName || env.evolution.instanceName;
  try {
    await api.post(`/message/sendReaction/${instance}`, {
      key: { remoteJid: `${to}@s.whatsapp.net`, id: messageId },
      reaction: emoji,
    });
  } catch (err) {
    logger.warn('Failed to send reaction', { to, error: err.message });
  }
}

// --- Media Download ---

async function downloadMedia(messageId, instanceName) {
  const instance = instanceName || env.evolution.instanceName;
  try {
    const response = await api.get(
      `/chat/getBase64FromMediaMessage/${instance}`,
      { params: { messageId }, timeout: 30000 }
    );
    return response.data;
  } catch (err) {
    logger.error('Failed to download media', { messageId, error: err.message });
    throw err;
  }
}

// --- Instance Management ---

async function getInstanceStatus(instanceName) {
  const instance = instanceName || env.evolution.instanceName;
  try {
    const response = await api.get(`/instance/connectionState/${instance}`);
    return response.data;
  } catch (err) {
    logger.error('Failed to get instance status', { instance, error: err.message });
    return { state: 'unknown', error: err.message };
  }
}

async function createInstance(instanceName) {
  const name = instanceName || env.evolution.instanceName;
  try {
    const response = await api.post('/instance/create', {
      instanceName: name,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
      webhook: 'http://backend:3000/api/webhook/evolution',
      webhookByEvents: false,
      webhookBase64: true,
      events: [
        'MESSAGES_UPSERT',
        'CONNECTION_UPDATE',
        'QRCODE_UPDATED',
      ],
    });
    logger.info('Evolution instance created', { instance: name });
    return response.data;
  } catch (err) {
    if (err.response?.status === 403 || err.response?.status === 409) {
      logger.info('Evolution instance already exists', { instance: name });
      return { existing: true };
    }
    throw err;
  }
}

async function setInstanceWebhook(instanceName) {
  try {
    const response = await api.post(`/webhook/set/${instanceName}`, {
      url: 'http://backend:3000/api/webhook/evolution',
      webhook_by_events: false,
      webhook_base64: true,
      events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
    });
    logger.info('Webhook set for instance', { instance: instanceName });
    return response.data;
  } catch (err) {
    logger.error('Failed to set webhook', { instance: instanceName, error: err.message });
    throw err;
  }
}

async function deleteInstance(instanceName) {
  try {
    await api.delete(`/instance/delete/${instanceName}`);
    logger.info('Evolution instance deleted', { instance: instanceName });
  } catch (err) {
    logger.error('Failed to delete instance', { instance: instanceName, error: err.message });
    throw err;
  }
}

async function fetchInstances() {
  try {
    const response = await api.get('/instance/fetchInstances');
    return response.data;
  } catch (err) {
    logger.error('Failed to fetch instances', { error: err.message });
    return [];
  }
}

async function getQrCode(instanceName) {
  try {
    const response = await api.get(`/instance/connect/${instanceName}`);
    return response.data;
  } catch (err) {
    logger.error('Failed to get QR code', { instance: instanceName, error: err.message });
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
  setInstanceWebhook,
  deleteInstance,
  fetchInstances,
  getQrCode,
  healthCheck,
};
