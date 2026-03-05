const supabase = require('../config/supabase');
const logger = require('../config/logger');

const VALID_MEMORY_TYPES = [
  'supplier_category',
  'expense_pattern',
  'revenue_pattern',
  'account_mapping',
  'financial_behavior',
];

async function insertMemory({ companyId, memoryType, memoryKey, memoryValue, confidence, source }) {
  const { data, error } = await supabase
    .from('ai_memories')
    .upsert(
      {
        company_id: companyId,
        memory_type: memoryType,
        memory_key: memoryKey,
        memory_value: memoryValue,
        confidence: confidence || 0.5,
        source: source || 'system',
      },
      { onConflict: 'company_id,memory_type,memory_key' }
    )
    .select()
    .single();

  if (error) {
    logger.error('Failed to insert memory', { companyId, memoryType, memoryKey, error: error.message });
    throw error;
  }
  return data;
}

async function updateMemoryConfidence(id, confidence) {
  const { data, error } = await supabase
    .from('ai_memories')
    .update({ confidence: Math.min(1, Math.max(0, confidence)) })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    logger.error('Failed to update memory confidence', { id, error: error.message });
    throw error;
  }
  return data;
}

async function updateMemoryValue(id, memoryValue, confidence) {
  const update = { memory_value: memoryValue };
  if (confidence !== undefined) {
    update.confidence = Math.min(1, Math.max(0, confidence));
  }

  const { data, error } = await supabase
    .from('ai_memories')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    logger.error('Failed to update memory value', { id, error: error.message });
    throw error;
  }
  return data;
}

async function findMemory(companyId, memoryType, memoryKey) {
  const { data, error } = await supabase
    .from('ai_memories')
    .select('*')
    .eq('company_id', companyId)
    .eq('memory_type', memoryType)
    .eq('memory_key', memoryKey)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

async function findMemoriesByType(companyId, memoryType, { minConfidence = 0, limit = 50 } = {}) {
  const { data, error } = await supabase
    .from('ai_memories')
    .select('*')
    .eq('company_id', companyId)
    .eq('memory_type', memoryType)
    .gte('confidence', minConfidence)
    .order('confidence', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

async function findAllMemories(companyId, { minConfidence = 0, limit = 100 } = {}) {
  const { data, error } = await supabase
    .from('ai_memories')
    .select('*')
    .eq('company_id', companyId)
    .gte('confidence', minConfidence)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

async function searchMemories(companyId, searchKey, { memoryType, minConfidence = 0, limit = 20 } = {}) {
  let query = supabase
    .from('ai_memories')
    .select('*')
    .eq('company_id', companyId)
    .ilike('memory_key', `%${searchKey}%`)
    .gte('confidence', minConfidence)
    .order('confidence', { ascending: false })
    .limit(limit);

  if (memoryType) query = query.eq('memory_type', memoryType);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function deleteMemory(id) {
  const { error } = await supabase.from('ai_memories').delete().eq('id', id);
  if (error) throw error;
}

async function getMemoryStats(companyId) {
  const { data, error } = await supabase
    .from('ai_memories')
    .select('memory_type, confidence')
    .eq('company_id', companyId);

  if (error) throw error;

  const stats = {};
  for (const type of VALID_MEMORY_TYPES) {
    const items = (data || []).filter((m) => m.memory_type === type);
    stats[type] = {
      count: items.length,
      avgConfidence: items.length ? items.reduce((s, m) => s + m.confidence, 0) / items.length : 0,
    };
  }
  stats.total = (data || []).length;
  return stats;
}

module.exports = {
  VALID_MEMORY_TYPES,
  insertMemory,
  updateMemoryConfidence,
  updateMemoryValue,
  findMemory,
  findMemoriesByType,
  findAllMemories,
  searchMemories,
  deleteMemory,
  getMemoryStats,
};
