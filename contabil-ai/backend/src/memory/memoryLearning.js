const supabase = require('../config/supabase');
const logger = require('../config/logger');
const memoryQueries = require('./memoryQueries');

// Confidence adjustment constants
const CONFIDENCE_HUMAN_CONFIRM = 0.05;
const CONFIDENCE_PATTERN_REPEAT = 0.02;
const CONFIDENCE_HUMAN_CORRECT = -0.1;
const CONFIDENCE_UNUSED_DECAY = -0.05;
const DEPRECATION_THRESHOLD = 0.3;
const UNUSED_MONTHS = 6;

// Record a memory hit (used successfully)
async function recordMemoryHit(companyId, memoryId) {
  const { error } = await supabase
    .from('ai_memories')
    .update({
      usage_count: supabase.rpc ? undefined : undefined, // handled via raw update below
      last_used_at: new Date().toISOString(),
    })
    .eq('id', memoryId);

  // Increment usage_count atomically
  await supabase.rpc('increment_memory_usage', { memory_id: memoryId }).catch(() => {
    // Fallback: read and update
    return incrementUsageCountFallback(memoryId);
  });

  await incrementMetric(companyId, 'memory_hits');
}

// Record a memory miss (no match found)
async function recordMemoryMiss(companyId) {
  await incrementMetric(companyId, 'memory_misses');
}

// Apply confidence boost from human confirmation
async function onHumanConfirmation(memoryId, companyId) {
  const memory = await getMemoryById(memoryId);
  if (!memory) return null;

  const newConfidence = Math.min(1, memory.confidence + CONFIDENCE_HUMAN_CONFIRM);
  await memoryQueries.updateMemoryConfidence(memoryId, newConfidence);
  await incrementMetric(companyId, 'confidence_updates');

  logger.info('Human confirmation boosted memory', { memoryId, oldConfidence: memory.confidence, newConfidence });
  return newConfidence;
}

// Apply confidence penalty from human correction
async function onHumanCorrection(memoryId, companyId, correctedValue) {
  const memory = await getMemoryById(memoryId);
  if (!memory) return null;

  const newConfidence = Math.max(0, memory.confidence + CONFIDENCE_HUMAN_CORRECT);

  if (newConfidence < DEPRECATION_THRESHOLD) {
    await deprecateMemory(memoryId);
    logger.info('Memory deprecated after correction', { memoryId, confidence: newConfidence });
  } else {
    await memoryQueries.updateMemoryConfidence(memoryId, newConfidence);
  }

  // If corrected value provided, create a new memory with the corrected data
  if (correctedValue) {
    const memoryService = require('./memoryService');
    await memoryService.storeMemory(
      memory.company_id,
      memory.memory_type,
      `${memory.memory_key}_corrected`,
      correctedValue,
      { source: 'human_correction', confidence: 0.7 }
    );
  }

  await incrementMetric(companyId, 'confidence_updates');
  return newConfidence;
}

// Apply confidence boost from pattern repetition
async function onPatternRepetition(memoryId, companyId) {
  const memory = await getMemoryById(memoryId);
  if (!memory) return null;

  const newConfidence = Math.min(1, memory.confidence + CONFIDENCE_PATTERN_REPEAT);
  await memoryQueries.updateMemoryConfidence(memoryId, newConfidence);

  return newConfidence;
}

// Detect supplier/category patterns across transactions and create memories
async function detectSupplierPatterns(companyId, transactions) {
  if (!transactions || transactions.length < 5) return [];

  const supplierCategories = {};

  for (const tx of transactions) {
    const supplier = (tx.supplier || '').toLowerCase().trim();
    const category = tx.category;
    if (!supplier || !category) continue;

    if (!supplierCategories[supplier]) supplierCategories[supplier] = {};
    supplierCategories[supplier][category] = (supplierCategories[supplier][category] || 0) + 1;
  }

  const created = [];
  for (const [supplier, categories] of Object.entries(supplierCategories)) {
    const total = Object.values(categories).reduce((a, b) => a + b, 0);
    if (total < 5) continue;

    // Find dominant category
    const [topCategory, topCount] = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];
    const dominance = topCount / total;

    if (dominance >= 0.8) {
      const existing = await memoryQueries.findMemory(companyId, 'supplier_category', supplier);
      if (!existing) {
        await memoryQueries.insertMemory({
          companyId,
          memoryType: 'supplier_category',
          memoryKey: supplier,
          memoryValue: { category: topCategory, occurrences: total, dominance },
          confidence: Math.min(0.9, 0.5 + total * 0.02),
          source: 'pattern_detection',
        });
        await incrementMetric(companyId, 'new_memories_created');
        created.push(supplier);
      } else if (existing.status === 'active') {
        await onPatternRepetition(existing.id, companyId);
      }
    }
  }

  if (created.length) {
    logger.info('Supplier patterns detected', { companyId, count: created.length });
  }
  return created;
}

// Run daily maintenance: decay unused, deprecate low confidence, update metrics
async function runDailyMaintenance() {
  logger.info('Starting memory daily maintenance');
  const startTime = Date.now();

  let decayed = 0;
  let deprecated = 0;
  let cleaned = 0;

  // Decay confidence for memories unused for 6+ months
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - UNUSED_MONTHS);

  const { data: staleMemories, error: staleErr } = await supabase
    .from('ai_memories')
    .select('id, company_id, confidence')
    .eq('status', 'active')
    .lt('last_used_at', cutoffDate.toISOString());

  if (!staleErr && staleMemories) {
    for (const mem of staleMemories) {
      const newConfidence = Math.max(0, mem.confidence + CONFIDENCE_UNUSED_DECAY);

      if (newConfidence < DEPRECATION_THRESHOLD) {
        await deprecateMemory(mem.id);
        deprecated++;
      } else {
        await memoryQueries.updateMemoryConfidence(mem.id, newConfidence);
        decayed++;
      }
    }
  }

  // Also decay memories that have never been used and are older than 3 months
  const neverUsedCutoff = new Date();
  neverUsedCutoff.setMonth(neverUsedCutoff.getMonth() - 3);

  const { data: neverUsed, error: neverErr } = await supabase
    .from('ai_memories')
    .select('id, company_id, confidence')
    .eq('status', 'active')
    .is('last_used_at', null)
    .lt('created_at', neverUsedCutoff.toISOString());

  if (!neverErr && neverUsed) {
    for (const mem of neverUsed) {
      const newConfidence = Math.max(0, mem.confidence + CONFIDENCE_UNUSED_DECAY);

      if (newConfidence < DEPRECATION_THRESHOLD) {
        await deprecateMemory(mem.id);
        deprecated++;
      } else {
        await memoryQueries.updateMemoryConfidence(mem.id, newConfidence);
        decayed++;
      }
    }
  }

  // Remove deprecated memories older than 1 year
  const cleanupDate = new Date();
  cleanupDate.setFullYear(cleanupDate.getFullYear() - 1);

  const { data: oldDeprecated, error: cleanErr } = await supabase
    .from('ai_memories')
    .delete()
    .eq('status', 'deprecated')
    .lt('updated_at', cleanupDate.toISOString())
    .select('id');

  if (!cleanErr && oldDeprecated) {
    cleaned = oldDeprecated.length;
  }

  const duration = Date.now() - startTime;
  logger.info('Memory maintenance completed', { decayed, deprecated, cleaned, durationMs: duration });

  return { decayed, deprecated, cleaned, durationMs: duration };
}

// Run daily metrics snapshot for all companies
async function updateDailyMetrics() {
  const today = new Date().toISOString().split('T')[0];

  const { data: companies, error } = await supabase
    .from('ai_memories')
    .select('company_id')
    .eq('status', 'active');

  if (error || !companies) return;

  const uniqueCompanies = [...new Set(companies.map((c) => c.company_id))];

  for (const companyId of uniqueCompanies) {
    const { data: deprecated } = await supabase
      .from('ai_memories')
      .select('id')
      .eq('company_id', companyId)
      .eq('status', 'deprecated');

    await supabase
      .from('memory_metrics')
      .upsert(
        { company_id: companyId, date: today, deprecated_count: deprecated?.length || 0 },
        { onConflict: 'company_id,date' }
      );
  }
}

// Full daily learning job: maintenance + metrics
async function runDailyLearningJob() {
  const maintenance = await runDailyMaintenance();
  await updateDailyMetrics();
  return maintenance;
}

// Helper: deprecate a memory
async function deprecateMemory(memoryId) {
  await supabase
    .from('ai_memories')
    .update({ status: 'deprecated', confidence: 0 })
    .eq('id', memoryId);
}

// Helper: get memory by ID
async function getMemoryById(memoryId) {
  const { data, error } = await supabase
    .from('ai_memories')
    .select('*')
    .eq('id', memoryId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

// Helper: increment usage_count without RPC
async function incrementUsageCountFallback(memoryId) {
  const memory = await getMemoryById(memoryId);
  if (!memory) return;

  await supabase
    .from('ai_memories')
    .update({ usage_count: (memory.usage_count || 0) + 1, last_used_at: new Date().toISOString() })
    .eq('id', memoryId);
}

// Helper: increment a metric field for today
async function incrementMetric(companyId, field) {
  const today = new Date().toISOString().split('T')[0];

  // Try upsert with the metric
  const { data: existing } = await supabase
    .from('memory_metrics')
    .select('*')
    .eq('company_id', companyId)
    .eq('date', today)
    .single();

  if (existing) {
    await supabase
      .from('memory_metrics')
      .update({ [field]: (existing[field] || 0) + 1 })
      .eq('id', existing.id);
  } else {
    await supabase
      .from('memory_metrics')
      .insert({ company_id: companyId, date: today, [field]: 1 });
  }
}

// Get learning stats for a company (extended)
async function getLearningStats(companyId) {
  const [allMemories, activeMemories, deprecatedMemories, candidateMemories, recentMetrics] = await Promise.all([
    supabase.from('ai_memories').select('id, memory_type, confidence, status, usage_count').eq('company_id', companyId),
    supabase.from('ai_memories').select('id').eq('company_id', companyId).eq('status', 'active'),
    supabase.from('ai_memories').select('id').eq('company_id', companyId).eq('status', 'deprecated'),
    supabase.from('ai_memories').select('id').eq('company_id', companyId).eq('status', 'candidate'),
    supabase.from('memory_metrics').select('*').eq('company_id', companyId).order('date', { ascending: false }).limit(30),
  ]);

  const all = allMemories.data || [];
  const active = activeMemories.data || [];
  const deprecated = deprecatedMemories.data || [];
  const candidates = candidateMemories.data || [];
  const metrics = recentMetrics.data || [];

  const totalUsage = all.reduce((s, m) => s + (m.usage_count || 0), 0);
  const avgConfidence = active.length
    ? all.filter((m) => m.status === 'active').reduce((s, m) => s + m.confidence, 0) / active.length
    : 0;

  // Calculate accuracy from metrics
  const totalHits = metrics.reduce((s, m) => s + (m.memory_hits || 0), 0);
  const totalMisses = metrics.reduce((s, m) => s + (m.memory_misses || 0), 0);
  const accuracy = totalHits + totalMisses > 0 ? totalHits / (totalHits + totalMisses) : 0;

  // By type breakdown
  const byType = {};
  for (const type of memoryQueries.VALID_MEMORY_TYPES) {
    const typeMemories = all.filter((m) => m.memory_type === type);
    byType[type] = {
      total: typeMemories.length,
      active: typeMemories.filter((m) => m.status === 'active').length,
      avgConfidence: typeMemories.length
        ? typeMemories.reduce((s, m) => s + m.confidence, 0) / typeMemories.length
        : 0,
    };
  }

  return {
    total: all.length,
    active: active.length,
    deprecated: deprecated.length,
    candidates: candidates.length,
    totalUsage,
    avgConfidence,
    accuracy,
    byType,
    recentMetrics: metrics,
  };
}

module.exports = {
  recordMemoryHit,
  recordMemoryMiss,
  onHumanConfirmation,
  onHumanCorrection,
  onPatternRepetition,
  detectSupplierPatterns,
  runDailyMaintenance,
  updateDailyMetrics,
  runDailyLearningJob,
  getLearningStats,
};
