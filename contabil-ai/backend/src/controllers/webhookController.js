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

async function handleEvolutionWebhook(req, res) {
  // Always respond 200 quickly to Evolution (avoid webhook retries)
  res.status(200).json({ status: 'received' });

  try {
    // Parse the event
    const event = whatsappService.parseWebhookEvent(req.body);

    logger.info('Webhook event received', { type: event.type, instance: event.instance, phone: event.phone });

    switch (event.type) {
      case 'message':
        await processMessage(event);
        break;

      case 'connection_update':
        logger.info('WhatsApp connection update', { state: event.state, instance: event.instance });
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
  const { phone, messageId, messageType, message, instance: webhookInstance } = event;

  // Resolve user context - try by phone first, then by instance
  const context = await resolveContext(phone, webhookInstance);
  if (!context) {
    // Try to find which instance to reply from
    const instanceName = await resolveInstanceName(webhookInstance);
    await whatsappService.sendText(
      phone,
      'Ola! Seu numero nao esta cadastrado no ContabilAI. Entre em contato com seu escritorio de contabilidade.',
      instanceName
    );
    return;
  }

  const inst = context.instanceName;

  // Show "processing" reaction
  await whatsappService.sendReaction(phone, messageId, '\u23F3', inst);

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
  await whatsappService.sendText(phone, responseText, inst);
  await whatsappService.sendReaction(phone, messageId, '', inst);
  await logMessage(context, phone, 'outgoing', { text: responseText }, 'text');
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
      const response = await aiService.interpretMessage(text, history, { botName: context.botName, officeName: context.officeName });
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
        history,
        { botName: context.botName, officeName: context.officeName }
      );
    }

    return aiService.interpretMessage(
      `${text}\n\nDados financeiros obtidos do sistema:\n${JSON.stringify(financialData, null, 2)}`,
      history,
      { botName: context.botName, officeName: context.officeName }
    );
  } catch (err) {
    logger.error('Financial query error', { error: err.message });
    return 'Desculpe, nao consegui acessar os dados financeiros no momento. Vou informar a equipe.';
  }
}

async function handleAudio(message, context, phone, messageId) {
  const media = await whatsappService.downloadMedia(messageId, context.instanceName);
  const filePath = path.join(env.upload.dir, `${uuidv4()}.ogg`);
  fs.writeFileSync(filePath, Buffer.from(media.base64, 'base64'));

  const result = await documentService.processAudio(filePath);
  return handleText(result.transcription, context, phone);
}

async function handleImage(message, context, phone, messageId) {
  const media = await whatsappService.downloadMedia(messageId, context.instanceName);
  const filePath = path.join(env.upload.dir, `${uuidv4()}.jpg`);
  fs.writeFileSync(filePath, Buffer.from(media.base64, 'base64'));

  const result = await documentService.processImage(filePath);

  await supabase.from('documents').insert({
    office_id: context.officeId,
    company_id: context.companyId,
    file_path: filePath,
    type: 'image',
    analysis: result.analysis,
  });

  return `Analisei a imagem enviada:\n\n${result.analysis}`;
}

async function handleDocument(message, context, phone, messageId) {
  const media = await whatsappService.downloadMedia(messageId, context.instanceName);
  const ext = message.documentMessage?.fileName?.split('.').pop() || 'pdf';
  const filePath = path.join(env.upload.dir, `${uuidv4()}.${ext}`);
  fs.writeFileSync(filePath, Buffer.from(media.base64, 'base64'));

  const result = await documentService.processDocument(filePath);

  await supabase.from('documents').insert({
    office_id: context.officeId,
    company_id: context.companyId,
    file_path: filePath,
    type: ext,
    analysis: result.analysis,
  });

  return `Analisei o documento enviado:\n\n${result.analysis}`;
}

async function resolveContext(phone, webhookInstance) {
  // 1. Find user by WhatsApp phone number
  const { data: user } = await supabase
    .from('users')
    .select('id, name, phone, active, office_id')
    .eq('phone', phone)
    .eq('active', true)
    .single();

  if (!user) return null;

  // 2. Find companies linked to this user via user_companies
  const { data: userCompanies } = await supabase
    .from('user_companies')
    .select('company:companies(*, office:offices(*))')
    .eq('user_id', user.id);

  if (!userCompanies || userCompanies.length === 0) return null;

  // Use first company (user may have multiple)
  const company = userCompanies[0].company;
  if (!company) return null;

  const office = company.office;

  // 3. Check for ERP integration (try company-level first, then office-level)
  let integration = null;
  const { data: companyIntegration } = await supabase
    .from('integration_tokens')
    .select('provider')
    .eq('company_id', company.id)
    .single();

  if (companyIntegration) {
    integration = companyIntegration;
  } else {
    const { data: officeIntegration } = await supabase
      .from('integration_tokens')
      .select('provider')
      .eq('office_id', company.office_id)
      .is('company_id', null)
      .single();
    integration = officeIntegration;
  }

  return {
    officeId: company.office_id,
    companyId: company.id,
    userId: user.id,
    userName: user.name,
    officeName: office?.name || 'Escritorio',
    botName: office?.bot_name || 'ContabilAI',
    instanceName: office?.evolution_instance_name || webhookInstance || null,
    integrationProvider: integration?.provider || null,
  };
}

// Resolve instance name from webhook instance field (for unknown contacts)
async function resolveInstanceName(webhookInstance) {
  if (!webhookInstance) return null;
  const { data: office } = await supabase
    .from('offices')
    .select('evolution_instance_name')
    .eq('evolution_instance_name', webhookInstance)
    .single();
  return office?.evolution_instance_name || webhookInstance;
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
  return data.reverse().map((m) => ({
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
