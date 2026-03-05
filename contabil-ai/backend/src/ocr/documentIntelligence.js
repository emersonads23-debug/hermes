const fs = require('fs');
const path = require('path');
const openai = require('../config/openai');
const supabase = require('../config/supabase');
const logger = require('../config/logger');

const CLASSIFICATION_PROMPT = `Voce e um especialista em classificacao de documentos financeiros brasileiros.
Analise o documento e retorne APENAS um JSON valido:

{
  "classification": "invoice|receipt|bank_slip|contract|tax_document|statement|report|other",
  "confidence": 95.5,
  "extracted_fields": {
    "supplier": "nome do fornecedor/emissor ou null",
    "amount": 1234.56,
    "date": "2024-01-15",
    "document_number": "numero do documento ou null",
    "cnpj": "CNPJ se encontrado ou null",
    "description": "descricao breve do documento",
    "due_date": "data de vencimento se aplicavel ou null",
    "payment_method": "metodo de pagamento se identificado ou null"
  }
}

Tipos:
- invoice: nota fiscal (NF-e, NFS-e, NFC-e)
- receipt: recibo de pagamento
- bank_slip: boleto bancario
- contract: contrato de servico
- tax_document: guia de imposto (DARF, GPS, DAS)
- statement: extrato bancario
- report: relatorio financeiro
- other: nao identificado`;

async function classifyDocument(filePath, mimeType) {
  const ext = path.extname(filePath).toLowerCase();
  let content;

  if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
    content = await classifyFromImage(filePath, mimeType);
  } else if (ext === '.pdf') {
    content = await classifyFromPdf(filePath);
  } else {
    let text;
    try {
      text = fs.readFileSync(filePath, 'utf8');
    } catch (fsErr) {
      logger.error('Failed to read text file', { filePath, error: fsErr.message });
      throw new Error(`Cannot read text file: ${fsErr.message}`);
    }
    content = await classifyFromText(text);
  }

  return content;
}

async function classifyFromImage(filePath, mimeType) {
  let imageBuffer;
  try {
    imageBuffer = fs.readFileSync(filePath);
  } catch (fsErr) {
    logger.error('Failed to read image file', { filePath, error: fsErr.message });
    throw new Error(`Cannot read image file: ${fsErr.message}`);
  }
  const base64 = imageBuffer.toString('base64');
  const mime = mimeType || (filePath.endsWith('.png') ? 'image/png' : 'image/jpeg');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: CLASSIFICATION_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Classifique e extraia dados deste documento:' },
          { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: 1024,
    response_format: { type: 'json_object' },
  });

  try {
    return JSON.parse(response?.choices?.[0]?.message?.content || '{}');
  } catch (parseErr) {
    logger.error('Failed to parse AI response', { error: parseErr.message });
    return { classification: 'unknown', confidence: 0, extracted_fields: {} };
  }
}

async function classifyFromPdf(filePath) {
  const pdfParse = require('pdf-parse');
  let buffer;
  try {
    buffer = fs.readFileSync(filePath);
  } catch (fsErr) {
    logger.error('Failed to read PDF file', { filePath, error: fsErr.message });
    throw new Error(`Cannot read PDF file: ${fsErr.message}`);
  }
  const pdf = await pdfParse(buffer);

  return classifyFromText(pdf.text);
}

async function classifyFromText(text) {
  const truncated = text.substring(0, 4000);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: CLASSIFICATION_PROMPT },
      { role: 'user', content: `Classifique e extraia dados deste documento:\n\n${truncated}` },
    ],
    temperature: 0.1,
    max_tokens: 1024,
    response_format: { type: 'json_object' },
  });

  try {
    return JSON.parse(response?.choices?.[0]?.message?.content || '{}');
  } catch (parseErr) {
    logger.error('Failed to parse AI response', { error: parseErr.message });
    return { classification: 'unknown', confidence: 0, extracted_fields: {} };
  }
}

async function processDocument(documentId) {
  const memoryEngine = require('../memory/memoryEngine');

  const { data: doc, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (error || !doc) {
    logger.error('Document not found', { documentId });
    throw new Error('Document not found');
  }

  // Mark as processing
  await supabase
    .from('documents')
    .update({ processing_status: 'processing' })
    .eq('id', documentId);

  try {
    let result = await classifyDocument(doc.file_path, doc.mime_type);

    // Enhance classification with memory if company is known
    if (doc.company_id) {
      result = await memoryEngine.enhanceClassification(doc.company_id, result);
    }

    const updateData = {
      classification: result.classification || 'unknown',
      classification_confidence: result.confidence || 0,
      extracted_data: result.extracted_fields || {},
      supplier: result.extracted_fields?.supplier || null,
      amount: result.extracted_fields?.amount || null,
      document_date: result.extracted_fields?.date || null,
      processing_status: 'completed',
      processed_at: new Date().toISOString(),
      analysis: JSON.stringify(result),
    };

    // If confidence < 80%, mark for review and create task
    if (result.confidence < 80) {
      updateData.processing_status = 'needs_review';

      await supabase.from('tasks').insert({
        office_id: doc.office_id,
        company_id: doc.company_id,
        task_type: 'document_review',
        title: `Revisar classificacao de documento: ${doc.original_filename || doc.file_path}`,
        message: `Documento classificado como "${result.classification}" com confianca de ${result.confidence}%. Requer revisao manual.`,
        attachment: doc.file_path,
        priority: 'medium',
        source_type: 'document',
        source_id: documentId,
      });

      logger.info('Document needs review, task created', { documentId, confidence: result.confidence });
    }

    await supabase
      .from('documents')
      .update(updateData)
      .eq('id', documentId);

    logger.info('Document processed', {
      documentId,
      classification: result.classification,
      confidence: result.confidence,
    });

    return { ...doc, ...updateData };
  } catch (err) {
    await supabase
      .from('documents')
      .update({ processing_status: 'failed' })
      .eq('id', documentId);

    logger.error('Document processing failed', { documentId, error: err.message });
    throw err;
  }
}

module.exports = {
  classifyDocument,
  classifyFromImage,
  classifyFromPdf,
  classifyFromText,
  processDocument,
};
