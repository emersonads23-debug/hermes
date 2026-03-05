const axios = require('axios');
const env = require('../config/env');
const logger = require('../config/logger');

const api = axios.create({
  baseURL: env.evolution.apiUrl,
  headers: { apikey: env.evolution.apiKey },
});

async function sendText(to, text) {
  try {
    await api.post(`/message/sendText/${env.evolution.instanceName}`, {
      number: to,
      text,
    });
    logger.info(`WhatsApp message sent to ${to}`);
  } catch (err) {
    logger.error('Failed to send WhatsApp message', { to, error: err.message });
    throw err;
  }
}

async function sendFile(to, filePath, caption = '') {
  try {
    await api.post(`/message/sendMedia/${env.evolution.instanceName}`, {
      number: to,
      mediatype: 'document',
      media: filePath,
      caption,
    });
  } catch (err) {
    logger.error('Failed to send WhatsApp file', { to, error: err.message });
    throw err;
  }
}

async function downloadMedia(messageId) {
  try {
    const response = await api.get(
      `/chat/getBase64FromMediaMessage/${env.evolution.instanceName}`,
      { params: { messageId } }
    );
    return response.data;
  } catch (err) {
    logger.error('Failed to download media', { messageId, error: err.message });
    throw err;
  }
}

module.exports = { sendText, sendFile, downloadMedia };
