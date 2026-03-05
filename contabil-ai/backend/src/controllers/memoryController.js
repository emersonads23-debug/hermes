const memoryService = require('../memory/memoryService');
const memoryEngine = require('../memory/memoryEngine');
const memoryQueries = require('../memory/memoryQueries');
const logger = require('../config/logger');

async function getMemories(req, res) {
  try {
    const { company_id, memory_type, min_confidence, limit } = req.query;

    if (!company_id) {
      return res.status(400).json({ error: 'company_id is required' });
    }

    const memories = await memoryService.getRelevantMemories(company_id, {
      memoryType: memory_type,
      minConfidence: min_confidence ? parseFloat(min_confidence) : 0,
      limit: limit ? parseInt(limit) : 50,
    });

    res.json(memories);
  } catch (err) {
    logger.error('Failed to get memories', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch memories' });
  }
}

async function searchMemories(req, res) {
  try {
    const { company_id, q, memory_type } = req.query;

    if (!company_id || !q) {
      return res.status(400).json({ error: 'company_id and q are required' });
    }

    const results = await memoryService.searchMemory(company_id, q, { memoryType: memory_type });
    res.json(results);
  } catch (err) {
    logger.error('Failed to search memories', { error: err.message });
    res.status(500).json({ error: 'Failed to search memories' });
  }
}

async function getStats(req, res) {
  try {
    const { company_id } = req.query;

    if (!company_id) {
      return res.status(400).json({ error: 'company_id is required' });
    }

    const stats = await memoryEngine.getLearningStats(company_id);
    res.json(stats);
  } catch (err) {
    logger.error('Failed to get memory stats', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch memory stats' });
  }
}

async function confirmClassification(req, res) {
  try {
    const { company_id, supplier, classification, account_code, category } = req.body;

    if (!company_id) {
      return res.status(400).json({ error: 'company_id is required' });
    }

    await memoryEngine.onClassificationConfirmed(company_id, {
      supplier,
      classification,
      accountCode: account_code,
      category,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to confirm classification', { error: err.message });
    res.status(500).json({ error: 'Failed to record classification' });
  }
}

async function confirmReconciliation(req, res) {
  try {
    const { company_id, description, category, account_code, amount } = req.body;

    if (!company_id) {
      return res.status(400).json({ error: 'company_id is required' });
    }

    await memoryEngine.onReconciliationConfirmed(company_id, {
      description,
      category,
      accountCode: account_code,
      amount,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to confirm reconciliation', { error: err.message });
    res.status(500).json({ error: 'Failed to record reconciliation' });
  }
}

async function deleteMemory(req, res) {
  try {
    await memoryQueries.deleteMemory(req.params.id);
    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to delete memory', { error: err.message });
    res.status(500).json({ error: 'Failed to delete memory' });
  }
}

async function humanConfirm(req, res) {
  try {
    const { memory_id, company_id } = req.body;
    if (!memory_id || !company_id) {
      return res.status(400).json({ error: 'memory_id and company_id are required' });
    }

    const memoryLearning = require('../memory/memoryLearning');
    const newConfidence = await memoryLearning.onHumanConfirmation(memory_id, company_id);
    res.json({ success: true, confidence: newConfidence });
  } catch (err) {
    logger.error('Failed to confirm memory', { error: err.message });
    res.status(500).json({ error: 'Failed to confirm memory' });
  }
}

async function humanCorrect(req, res) {
  try {
    const { memory_id, company_id, corrected_value } = req.body;
    if (!memory_id || !company_id) {
      return res.status(400).json({ error: 'memory_id and company_id are required' });
    }

    const memoryLearning = require('../memory/memoryLearning');
    const newConfidence = await memoryLearning.onHumanCorrection(memory_id, company_id, corrected_value);
    res.json({ success: true, confidence: newConfidence });
  } catch (err) {
    logger.error('Failed to correct memory', { error: err.message });
    res.status(500).json({ error: 'Failed to correct memory' });
  }
}

module.exports = {
  getMemories,
  searchMemories,
  getStats,
  confirmClassification,
  confirmReconciliation,
  humanConfirm,
  humanCorrect,
  deleteMemory,
};
