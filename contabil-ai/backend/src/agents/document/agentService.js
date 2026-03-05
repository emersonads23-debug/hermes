const documentIntelligence = require('../../ocr/documentIntelligence');

async function processDocument(documentId) {
  return documentIntelligence.processDocument(documentId);
}

module.exports = {
  processDocument,
};
