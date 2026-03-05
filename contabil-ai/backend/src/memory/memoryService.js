const logger = require('../config/logger');
const memoryQueries = require('./memoryQueries');

// Store a new memory or update existing one with confidence boost
async function storeMemory(companyId, memoryType, memoryKey, memoryValue, { source = 'system', confidence = 0.5 } = {}) {
  const normalizedKey = memoryKey.toLowerCase().trim();

  const existing = await memoryQueries.findMemory(companyId, memoryType, normalizedKey);

  if (existing) {
    // Boost confidence on repeated confirmation (max 1.0)
    const newConfidence = Math.min(1, existing.confidence + 0.1);
    const merged = mergeMemoryValues(existing.memory_value, memoryValue);
    const updated = await memoryQueries.updateMemoryValue(existing.id, merged, newConfidence);
    logger.info('Memory updated', { companyId, memoryType, key: normalizedKey, confidence: newConfidence });
    return updated;
  }

  const created = await memoryQueries.insertMemory({
    companyId,
    memoryType,
    memoryKey: normalizedKey,
    memoryValue,
    confidence,
    source,
  });
  logger.info('Memory created', { companyId, memoryType, key: normalizedKey, confidence });
  return created;
}

// Update confidence for an existing memory
async function updateMemory(memoryId, { memoryValue, confidence } = {}) {
  if (memoryValue !== undefined) {
    return memoryQueries.updateMemoryValue(memoryId, memoryValue, confidence);
  }
  if (confidence !== undefined) {
    return memoryQueries.updateMemoryConfidence(memoryId, confidence);
  }
  return null;
}

// Get a specific memory by type and key
async function getMemory(companyId, memoryType, memoryKey) {
  return memoryQueries.findMemory(companyId, memoryType, memoryKey.toLowerCase().trim());
}

// Search memories by partial key match
async function searchMemory(companyId, searchKey, options = {}) {
  return memoryQueries.searchMemories(companyId, searchKey, options);
}

// Get all high-confidence memories for a company, optionally by type
async function getRelevantMemories(companyId, { memoryType, minConfidence = 0.8, limit = 50 } = {}) {
  if (memoryType) {
    return memoryQueries.findMemoriesByType(companyId, memoryType, { minConfidence, limit });
  }
  return memoryQueries.findAllMemories(companyId, { minConfidence, limit });
}

// Lookup supplier category from memory
async function lookupSupplierCategory(companyId, supplierName) {
  if (!supplierName) return null;
  const memory = await memoryQueries.findMemory(companyId, 'supplier_category', supplierName.toLowerCase().trim());
  if (memory && memory.confidence >= 0.8) return memory;
  return null;
}

// Lookup account mapping from memory
async function lookupAccountMapping(companyId, description) {
  if (!description) return null;
  const results = await memoryQueries.searchMemories(companyId, description, {
    memoryType: 'account_mapping',
    minConfidence: 0.8,
    limit: 1,
  });
  return results[0] || null;
}

// Record a confirmed classification to build memory
async function learnFromClassification(companyId, { supplier, classification, accountCode, category, source = 'classification_confirmed' }) {
  const promises = [];

  if (supplier && category) {
    promises.push(
      storeMemory(companyId, 'supplier_category', supplier, { category, classification }, { source, confidence: 0.7 })
    );
  }

  if (supplier && accountCode) {
    promises.push(
      storeMemory(companyId, 'account_mapping', supplier, { account_code: accountCode, description: classification }, { source, confidence: 0.7 })
    );
  }

  await Promise.all(promises);
}

// Record a confirmed reconciliation to build memory
async function learnFromReconciliation(companyId, { description, category, accountCode, amount, source = 'reconciliation_confirmed' }) {
  const promises = [];

  if (description && category) {
    promises.push(
      storeMemory(companyId, 'expense_pattern', description, { category, typical_amount: amount }, { source, confidence: 0.7 })
    );
  }

  if (description && accountCode) {
    promises.push(
      storeMemory(companyId, 'account_mapping', description, { account_code: accountCode, category }, { source, confidence: 0.7 })
    );
  }

  await Promise.all(promises);
}

// Record a transaction pattern when it repeats
async function learnFromTransactionPattern(companyId, { patternKey, patternType, patternData, occurrences, source = 'pattern_detection' }) {
  const confidence = Math.min(1, 0.3 + occurrences * 0.1);
  const memoryType = patternType === 'revenue' ? 'revenue_pattern' : 'expense_pattern';

  return storeMemory(companyId, memoryType, patternKey, patternData, { source, confidence });
}

// Record financial behavior observation
async function learnFinancialBehavior(companyId, { behaviorKey, behaviorData, source = 'analysis' }) {
  return storeMemory(companyId, 'financial_behavior', behaviorKey, behaviorData, { source, confidence: 0.6 });
}

// Build memory context string for AI prompts
async function buildMemoryContext(companyId) {
  const memories = await getRelevantMemories(companyId, { minConfidence: 0.8, limit: 30 });

  if (!memories.length) return '';

  const grouped = {};
  for (const m of memories) {
    if (!grouped[m.memory_type]) grouped[m.memory_type] = [];
    grouped[m.memory_type].push(m);
  }

  const lines = ['Memorias conhecidas desta empresa:'];

  if (grouped.supplier_category) {
    lines.push('\nFornecedores conhecidos:');
    for (const m of grouped.supplier_category.slice(0, 10)) {
      lines.push(`- ${m.memory_key}: ${m.memory_value.category || JSON.stringify(m.memory_value)} (confianca: ${(m.confidence * 100).toFixed(0)}%)`);
    }
  }

  if (grouped.expense_pattern) {
    lines.push('\nPadroes de despesas:');
    for (const m of grouped.expense_pattern.slice(0, 10)) {
      lines.push(`- ${m.memory_key}: ${m.memory_value.category || JSON.stringify(m.memory_value)} (confianca: ${(m.confidence * 100).toFixed(0)}%)`);
    }
  }

  if (grouped.account_mapping) {
    lines.push('\nMapeamentos de contas:');
    for (const m of grouped.account_mapping.slice(0, 10)) {
      lines.push(`- ${m.memory_key} -> conta ${m.memory_value.account_code || JSON.stringify(m.memory_value)} (confianca: ${(m.confidence * 100).toFixed(0)}%)`);
    }
  }

  if (grouped.financial_behavior) {
    lines.push('\nComportamentos financeiros:');
    for (const m of grouped.financial_behavior.slice(0, 5)) {
      lines.push(`- ${m.memory_key}: ${JSON.stringify(m.memory_value)}`);
    }
  }

  return lines.join('\n');
}

function mergeMemoryValues(existing, incoming) {
  if (typeof existing !== 'object' || typeof incoming !== 'object') return incoming;
  return { ...existing, ...incoming, _lastUpdated: new Date().toISOString() };
}

module.exports = {
  storeMemory,
  updateMemory,
  getMemory,
  searchMemory,
  getRelevantMemories,
  lookupSupplierCategory,
  lookupAccountMapping,
  learnFromClassification,
  learnFromReconciliation,
  learnFromTransactionPattern,
  learnFinancialBehavior,
  buildMemoryContext,
};
