const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const aiService = require('./aiService');
const logger = require('../config/logger');

async function processDocument(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    return processImage(filePath);
  }

  if (ext === '.pdf') {
    return processPdf(filePath);
  }

  throw new Error(`Tipo de arquivo nao suportado: ${ext}`);
}

async function processImage(filePath) {
  logger.info('Processing image document', { filePath });
  const analysis = await aiService.analyzeImage(filePath);
  return {
    type: 'image',
    filePath,
    analysis,
    processedAt: new Date().toISOString(),
  };
}

async function processPdf(filePath) {
  logger.info('Processing PDF document', { filePath });
  const buffer = fs.readFileSync(filePath);
  const pdfData = await pdfParse(buffer);
  const analysis = await aiService.analyzePdf(pdfData.text);
  return {
    type: 'pdf',
    filePath,
    pageCount: pdfData.numpages,
    rawText: pdfData.text,
    analysis,
    processedAt: new Date().toISOString(),
  };
}

async function processAudio(filePath) {
  logger.info('Transcribing audio', { filePath });
  const transcription = await aiService.transcribeAudio(filePath);
  return {
    type: 'audio',
    filePath,
    transcription,
    processedAt: new Date().toISOString(),
  };
}

module.exports = { processDocument, processImage, processPdf, processAudio };
