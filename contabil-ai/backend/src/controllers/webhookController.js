const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const aiService = require('../services/aiService');
const whatsappService = require('../services/whatsappService');
const documentService = require('../services/documentService');
const escalationService = require('../services/escalationService');
const contaAzulService = require('../services/contaAzulService');
const omieService = require('../services/omieService');
const supabase = require('../config/supabase');
const env = require('../config/env');
const logger = require('../config/logger');

async function handleEvolutionWebhook(req, res) {
  try {
    const { data } = req.body;
    if (!data || !data.message) {
      return res.status(200).json({ status: 'ignored' });
    }

    const phone = data.key.remoteJid.replace('@s.whatsapp.net', '');
    const messageId = data.key.id;

    // Find user/company by phone
    const context = await resolveContext(phone);
    if (!context) {
      await whatsappService.sendText(phone,
        'Ola! Seu numero nao esta cadastrado no ContabilAI. Entre em contato com seu escritorio de contabilidade.');
      return res.status(200).json({ status: 'unregistered' });
    }

    // Log conversation
    await logMessage(context, phone, 'incoming', data.message);

    let responseText;

    // Handle different message types
    if (data.message.audioMessage) {
      responseText = await handleAudio(data, context, phone, messageId);
    } else if (data.message.imageMessage) {
      responseText = await handleImage(data, context, phone, messageId);
    } else if (data.message.documentMessage) {
      responseText = await handleDocument(data, context, phone, messageId);
    } else {
      const text = data.message.conversation || data.message.extendedTextMessage?.text || '';
      responseText = await handleText(text, context, phone);
    }

    await whatsappService.sendText(phone, responseText);
    await logMessage(context, phone, 'outgoing', { text: responseText });

    res.status(200).json({ status: 'processed' });
  } catch (err) {
    logger.error('Webhook processing error', { error: err.message, stack: err.stack });
    res.status(200).json({ status: 'error' });
  }
}

async function handleText(text, context, phone) {
  const intent = await aiService.classifyIntent(text);
  logger.info('Intent classified', { intent, phone });

  const history = await getConversationHistory(context, phone);

  switch (intent) {
    case 'CONSULTA_NF':
    case 'CONSULTA_BOLETO':
    case 'CONSULTA_FINANCEIRA':
      return handleFinancialQuery(text, context, intent, history);

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

async function handleAudio(data, context, phone, messageId) {
  const media = await whatsappService.downloadMedia(messageId);
  const filePath = path.join(env.upload.dir, `${uuidv4()}.ogg`);
  fs.writeFileSync(filePath, Buffer.from(media.base64, 'base64'));

  const result = await documentService.processAudio(filePath);
  return handleText(result.transcription, context, phone);
}

async function handleImage(data, context, phone, messageId) {
  const media = await whatsappService.downloadMedia(messageId);
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

async function handleDocument(data, context, phone, messageId) {
  const media = await whatsappService.downloadMedia(messageId);
  const ext = data.message.documentMessage.fileName?.split('.').pop() || 'pdf';
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
  return data.reverse().map((m) => ({
    role: m.direction === 'incoming' ? 'user' : 'assistant',
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
  }));
}

async function logMessage(context, phone, direction, content) {
  await supabase.from('messages').insert({
    office_id: context.officeId,
    company_id: context.companyId,
    contact_phone: phone,
    direction,
    content: typeof content === 'string' ? content : JSON.stringify(content),
  });
}

module.exports = { handleEvolutionWebhook };
