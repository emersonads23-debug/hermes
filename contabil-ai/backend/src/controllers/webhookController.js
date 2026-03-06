const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const aiService = require('../services/aiService');
const whatsappService = require('../services/whatsappService');
const documentService = require('../services/documentService');
const escalationService = require('../services/escalationService');
const contaAzulService = require('../services/contaAzulService');
const omieService = require('../services/omieService');
const n8nService = require('../services/n8nService');
const supabase = require('../config/supabase');
const env = require('../config/env');
const logger = require('../config/logger');

const MIME_TYPES = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', webp: 'image/webp',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv', txt: 'text/plain', xml: 'application/xml',
};

async function handleEvolutionWebhook(req, res) {
  // Always respond 200 quickly to Evolution (avoid webhook retries)
  res.status(200).json({ status: 'received' });

  try {
    // Validate webhook signature if configured
    if (env.evolution.webhookSecret) {
      const signature = req.headers['x-webhook-signature'] || req.headers['x-evolution-signature'];
      const rawBody = req.rawBody || JSON.stringify(req.body);
      if (!whatsappService.validateWebhookSignature(rawBody, signature)) {
        logger.warn('Invalid webhook signature', { ip: req.ip });
        return;
      }
    }

    // Parse the event
    const event = whatsappService.parseWebhookEvent(req.body);

    switch (event.type) {
      case 'message':
        await processMessage(event);
        break;

      case 'connection_update':
        logger.info('WhatsApp connection update', { state: event.state, reason: event.statusReason });
        await n8nService.triggerWorkflow('connection-update', {
          state: event.state,
          instance: event.instance,
          timestamp: new Date().toISOString(),
        });
        break;

      case 'qrcode':
        logger.info('QR code updated for instance', { instance: event.instance });
        break;

      case 'group_message':
      case 'own_message':
      case 'status_broadcast':
        // Silently ignore
        break;

      default:
        logger.debug('Unhandled webhook event', { type: event.type });
    }
  } catch (err) {
    logger.error('Webhook processing error', { error: err.message, stack: err.stack });
  }
}

async function processMessage(event) {
  const { phone, messageId, messageType, message } = event;

  // Resolve user context
  const context = await resolveContext(phone);
  if (!context) {
    await whatsappService.sendText(
      phone,
      'Ola! Seu numero nao esta cadastrado no ContabilAI. Entre em contato com seu escritorio de contabilidade.'
    );
    return;
  }

  const office = context.office;

  // Show "processing" reaction
  await whatsappService.sendReaction(phone, messageId, '\u23F3', office);

  // Log incoming message
  await logMessage(context, phone, 'incoming', message, messageType);

  let responseText;

  try {
    switch (messageType) {
      case 'audio':
        responseText = await handleAudio(message, context, phone, messageId);
        break;
      case 'image':
        responseText = await handleImage(message, context, phone, messageId);
        break;
      case 'document':
        responseText = await handleDocument(message, context, phone, messageId);
        break;
      default:
        const text = message.conversation || message.extendedTextMessage?.text || '';
        if (!text.trim()) {
          responseText = 'Desculpe, nao consegui entender essa mensagem. Envie um texto, audio, imagem ou PDF.';
        } else {
          responseText = await handleText(text, context, phone);
        }
    }
  } catch (err) {
    logger.error('Message processing failed', { phone, messageType, error: err.message });
    responseText = 'Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente em instantes.';

    // Auto-escalate processing errors
    await escalationService.createEscalation({
      officeId: context.officeId,
      companyId: context.companyId,
      userPhone: phone,
      subject: 'Erro no processamento de mensagem',
      description: `Tipo: ${messageType}\nErro: ${err.message}`,
    });
  }

  // Send response and clear reaction
  await whatsappService.sendText(phone, responseText, office);
  await whatsappService.sendReaction(phone, messageId, '', office);
  await logMessage(context, phone, 'outgoing', { text: responseText }, 'text');

  // Notify n8n of processed message
  await n8nService.triggerWorkflow('message-processed', {
    phone,
    messageType,
    officeId: context.officeId,
    companyId: context.companyId,
    timestamp: new Date().toISOString(),
  });
}

async function handleText(text, context, phone) {
  const intent = await aiService.classifyIntent(text);
  logger.info('Intent classified', { intent, phone });

  const history = await getConversationHistory(context, phone);

  switch (intent) {
    case 'CONSULTA_NF':
    case 'CONSULTA_BOLETO':
    case 'CONSULTA_FINANCEIRA':
      return handleCopilotQuery(text, context);

    case 'ESCALAR':
      await escalationService.createEscalation({
        officeId: context.officeId,
        companyId: context.companyId,
        userPhone: phone,
        subject: 'Solicitacao de atendimento humano',
        description: text,
      });
      return 'Entendi! Vou encaminhar sua solicitacao para a equipe do escritorio. Em breve alguem entrara em contato.';

    default: {
      const response = await aiService.interpretMessage(text, history);
      const needsEscalation = await aiService.shouldEscalate(text, response);
      if (needsEscalation) {
        await escalationService.createEscalation({
          officeId: context.officeId,
          companyId: context.companyId,
          userPhone: phone,
          subject: 'Escalacao automatica - IA',
          description: `Mensagem: ${text}\n\nResposta IA: ${response}`,
        });
      }
      return response;
    }
  }
}

async function handleCopilotQuery(text, context) {
  try {
    const copilotEngine = require('../copilot/copilotEngine');
    return await copilotEngine.answerFinancialQuery(context.companyId, text);
  } catch (err) {
    logger.error('Copilot WhatsApp query failed', { error: err.message });
    return handleFinancialQuery(text, context, 'CONSULTA_FINANCEIRA', []);
  }
}

async function handleFinancialQuery(text, context, intent, history) {
  try {
    let financialData;
    const provider = context.integrationProvider;

    if (provider === 'conta_azul') {
      if (intent === 'CONSULTA_FINANCEIRA') {
        financialData = await contaAzulService.getFinancialSummary(context.officeId);
      } else {
        financialData = await contaAzulService.getInvoices(context.officeId);
      }
    } else if (provider === 'omie') {
      if (intent === 'CONSULTA_FINANCEIRA') {
        financialData = await omieService.getFinancialSummary(context.officeId);
      } else {
        financialData = await omieService.listInvoices(context.officeId);
      }
    } else {
      return aiService.interpretMessage(
        `${text}\n\n(Nenhuma integracao financeira configurada - responda com base no conhecimento geral)`,
        history
      );
    }

    return aiService.interpretMessage(
      `${text}\n\nDados financeiros obtidos do sistema:\n${JSON.stringify(financialData, null, 2)}`,
      history
    );
  } catch (err) {
    logger.error('Financial query error', { error: err.message });
    return 'Desculpe, nao consegui acessar os dados financeiros no momento. Vou informar a equipe.';
  }
}

async function handleAudio(message, context, phone, messageId) {
  const media = await whatsappService.downloadMedia(messageId);
  if (media.base64 && Buffer.byteLength(media.base64, 'base64') > MAX_FILE_SIZE_BYTES) {
    return 'Desculpe, o arquivo enviado excede o limite de 25MB.';
  }
  const filePath = path.join(env.upload.dir, `${uuidv4()}.ogg`);
  try {
    fs.writeFileSync(filePath, Buffer.from(media.base64, 'base64'));
    const result = await documentService.processAudio(filePath);
    return handleText(result.transcription, context, phone);
  } finally {
    try { fs.unlinkSync(filePath); } catch {}
  }
}

async function handleImage(message, context, phone, messageId) {
  const media = await whatsappService.downloadMedia(messageId);
  if (media.base64 && Buffer.byteLength(media.base64, 'base64') > MAX_FILE_SIZE_BYTES) {
    return 'Desculpe, o arquivo enviado excede o limite de 25MB.';
  }
  const filePath = path.join(env.upload.dir, `${uuidv4()}.jpg`);
  try {
    fs.writeFileSync(filePath, Buffer.from(media.base64, 'base64'));

    const result = await documentService.processImage(filePath);

    await supabase.from('documents').insert({
      office_id: context.officeId,
      company_id: context.companyId,
      file_path: filePath,
      type: 'image',
      mime_type: 'image/jpeg',
      analysis: result.analysis,
    });

    return `Analisei a imagem enviada:\n\n${result.analysis}`;
  } finally {
    try { fs.unlinkSync(filePath); } catch {}
  }
}

const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'xml', 'ogg', 'mp3', 'mp4'];
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

async function handleDocument(message, context, phone, messageId) {
  const media = await whatsappService.downloadMedia(messageId);
  const rawExt = (message.documentMessage?.fileName?.split('.').pop() || 'pdf').toLowerCase();
  const ext = ALLOWED_EXTENSIONS.includes(rawExt) ? rawExt : 'pdf';

  // Validate file size (base64 is ~1.33x of actual file size)
  if (media.base64 && Buffer.byteLength(media.base64, 'base64') > MAX_FILE_SIZE_BYTES) {
    return 'Desculpe, o arquivo enviado excede o limite de 25MB.';
  }

  const filePath = path.join(env.upload.dir, `${uuidv4()}.${ext}`);
  try {
    fs.writeFileSync(filePath, Buffer.from(media.base64, 'base64'));

    const result = await documentService.processDocument(filePath);

    await supabase.from('documents').insert({
      office_id: context.officeId,
      company_id: context.companyId,
      file_path: filePath,
      type: ext,
      mime_type: MIME_TYPES[ext] || message.documentMessage?.mimetype || 'application/octet-stream',
      analysis: result.analysis,
    });

    return `Analisei o documento enviado:\n\n${result.analysis}`;
  } finally {
    try { fs.unlinkSync(filePath); } catch {}
  }
}

async function resolveContext(phone) {
  const { data: user } = await supabase
    .from('whatsapp_contacts')
    .select('*, company:companies(*, office:offices(*))')
    .eq('phone', phone)
    .eq('active', true)
    .single();

  if (!user || !user.company) return null;

  const { data: integration } = await supabase
    .from('integration_tokens')
    .select('provider')
    .eq('office_id', user.company.office_id)
    .single();

  return {
    officeId: user.company.office_id,
    companyId: user.company_id,
    contactId: user.id,
    integrationProvider: integration?.provider || null,
    office: user.company.office,
  };
}

async function getConversationHistory(context, phone) {
  const { data } = await supabase
    .from('messages')
    .select('direction, content')
    .eq('contact_phone', phone)
    .eq('company_id', context.companyId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (!data) return [];
  return [...data].reverse().map((m) => ({
    role: m.direction === 'incoming' ? 'user' : 'assistant',
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
  }));
}

async function logMessage(context, phone, direction, content, messageType = 'text') {
  await supabase.from('messages').insert({
    office_id: context.officeId,
    company_id: context.companyId,
    contact_phone: phone,
    direction,
    content: typeof content === 'string' ? content : JSON.stringify(content),
    message_type: messageType,
  });
}

module.exports = { handleEvolutionWebhook };
