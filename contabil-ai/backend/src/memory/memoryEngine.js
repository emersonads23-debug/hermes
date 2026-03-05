const logger = require('../config/logger');
const memoryService = require('./memoryService');
const memoryQueries = require('./memoryQueries');

// Enhance a classification result using existing memories
async function enhanceClassification(companyId, classificationResult) {
  const { extracted_fields } = classificationResult;
  if (!extracted_fields) return classificationResult;

  const enhanced = { ...classificationResult, memory_applied: false };

  const memoryLearning = require('./memoryLearning');
  let hadHit = false;

  // Check supplier category memory
  if (extracted_fields.supplier) {
    const supplierMemory = await memoryService.lookupSupplierCategory(companyId, extracted_fields.supplier);
    if (supplierMemory) {
      hadHit = true;
      enhanced.memory_applied = true;
      enhanced.memory_hints = enhanced.memory_hints || {};
      enhanced.memory_hints.supplier_category = supplierMemory.memory_value.category;
      enhanced.memory_hints.supplier_confidence = supplierMemory.confidence;

      // Track usage
      await memoryQueries.recordUsage(supplierMemory.id);
      await memoryLearning.recordMemoryHit(companyId, supplierMemory.id);

      // If AI classification had low confidence but memory is strong, boost it
      if (classificationResult.confidence < 80 && supplierMemory.confidence >= 0.9) {
        enhanced.confidence = Math.max(classificationResult.confidence, 85);
        enhanced.classification = supplierMemory.memory_value.classification || enhanced.classification;
        logger.info('Memory boosted classification confidence', {
          companyId,
          supplier: extracted_fields.supplier,
          originalConfidence: classificationResult.confidence,
          boostedConfidence: enhanced.confidence,
        });
      }
    }
  }

  // Check account mapping memory
  if (extracted_fields.description || extracted_fields.supplier) {
    const key = extracted_fields.description || extracted_fields.supplier;
    const accountMemory = await memoryService.lookupAccountMapping(companyId, key);
    if (accountMemory) {
      hadHit = true;
      enhanced.memory_applied = true;
      enhanced.memory_hints = enhanced.memory_hints || {};
      enhanced.memory_hints.account_code = accountMemory.memory_value.account_code;
      enhanced.memory_hints.account_confidence = accountMemory.confidence;

      // Track usage
      await memoryQueries.recordUsage(accountMemory.id);
      await memoryLearning.recordMemoryHit(companyId, accountMemory.id);
    }
  }

  // If no memory matched, record a miss and create candidate
  if (!hadHit && extracted_fields.supplier) {
    await memoryLearning.recordMemoryMiss(companyId);
  }

  return enhanced;
}

// Process a confirmed document classification and learn from it
async function onClassificationConfirmed(companyId, { supplier, classification, accountCode, category }) {
  try {
    await memoryService.learnFromClassification(companyId, {
      supplier,
      classification,
      accountCode,
      category,
      source: 'classification_confirmed',
    });
    logger.info('Learned from confirmed classification', { companyId, supplier, classification });
  } catch (err) {
    logger.error('Failed to learn from classification', { companyId, error: err.message });
  }
}

// Process a confirmed reconciliation and learn from it
async function onReconciliationConfirmed(companyId, { description, category, accountCode, amount }) {
  try {
    await memoryService.learnFromReconciliation(companyId, {
      description,
      category,
      accountCode,
      amount,
      source: 'reconciliation_confirmed',
    });
    logger.info('Learned from confirmed reconciliation', { companyId, description });
  } catch (err) {
    logger.error('Failed to learn from reconciliation', { companyId, error: err.message });
  }
}

// Detect and learn from repeating transaction patterns
async function detectAndLearnPatterns(companyId, transactions) {
  if (!transactions || transactions.length < 3) return [];

  const patterns = {};

  for (const tx of transactions) {
    const key = normalizePatternKey(tx.description || tx.supplier || '');
    if (!key) continue;

    if (!patterns[key]) {
      patterns[key] = { count: 0, amounts: [], categories: [], type: tx.amount > 0 ? 'revenue' : 'expense' };
    }
    patterns[key].count++;
    if (tx.amount) patterns[key].amounts.push(Math.abs(tx.amount));
    if (tx.category) patterns[key].categories.push(tx.category);
  }

  const learned = [];
  for (const [key, pattern] of Object.entries(patterns)) {
    if (pattern.count < 3) continue;

    const avgAmount = pattern.amounts.length
      ? pattern.amounts.reduce((a, b) => a + b, 0) / pattern.amounts.length
      : null;

    const topCategory = mostFrequent(pattern.categories);

    try {
      await memoryService.learnFromTransactionPattern(companyId, {
        patternKey: key,
        patternType: pattern.type,
        patternData: {
          occurrences: pattern.count,
          avg_amount: avgAmount,
          category: topCategory,
        },
        occurrences: pattern.count,
      });
      learned.push(key);
    } catch (err) {
      logger.error('Failed to learn pattern', { companyId, key, error: err.message });
    }
  }

  if (learned.length) {
    logger.info('Detected transaction patterns', { companyId, count: learned.length });
  }
  return learned;
}

// Build memory context for AI prompts
async function getMemoryContext(companyId) {
  return memoryService.buildMemoryContext(companyId);
}

// Get memory statistics for a company
async function getStats(companyId) {
  return memoryQueries.getMemoryStats(companyId);
}

// Get extended learning stats for a company
async function getLearningStats(companyId) {
  const memoryLearning = require('./memoryLearning');
  return memoryLearning.getLearningStats(companyId);
}

function normalizePatternKey(str) {
  return str
    .toLowerCase()
    .replace(/[0-9]{2,}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 100);
}

function mostFrequent(arr) {
  if (!arr.length) return null;
  const freq = {};
  let maxCount = 0;
  let maxVal = null;
  for (const val of arr) {
    freq[val] = (freq[val] || 0) + 1;
    if (freq[val] > maxCount) {
      maxCount = freq[val];
      maxVal = val;
    }
  }
  return maxVal;
}

module.exports = {
  enhanceClassification,
  onClassificationConfirmed,
  onReconciliationConfirmed,
  detectAndLearnPatterns,
  getMemoryContext,
  getStats,
  getLearningStats,
};
