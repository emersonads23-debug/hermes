const supabase = require('../../config/supabase');
const logger = require('../../config/logger');

async function findMatchingTransaction(companyId, { supplier, amount, date }) {
  // Search for unreconciled transactions matching supplier and approximate amount
  const tolerance = Math.abs(amount) * 0.02; // 2% tolerance
  const minAmount = Math.abs(amount) - tolerance;
  const maxAmount = Math.abs(amount) + tolerance;

  let query = supabase
    .from('transactions')
    .select('*')
    .eq('company_id', companyId)
    .eq('reconciled', false)
    .gte('amount', minAmount)
    .lte('amount', maxAmount)
    .order('date', { ascending: false })
    .limit(5);

  if (supplier) {
    query = query.ilike('description', `%${supplier.substring(0, 20)}%`);
  }

  const { data, error } = await query;

  if (error) {
    logger.warn('Transaction search failed', { companyId, error: error.message });
    return null;
  }

  return data?.[0] || null;
}

async function reconcile(companyId, { documentId, transactionId, supplier, amount, classification }) {
  // Determine category from memory or classification
  let category = classification;
  let accountCode = null;

  try {
    const memoryService = require('../../memory/memoryService');
    const supplierMemory = await memoryService.lookupSupplierCategory(companyId, supplier);
    if (supplierMemory) {
      category = supplierMemory.memory_value.category || category;
    }

    const accountMemory = await memoryService.lookupAccountMapping(companyId, supplier);
    if (accountMemory) {
      accountCode = accountMemory.memory_value.account_code;
    }
  } catch (err) {
    logger.warn('Memory lookup failed during reconciliation', { error: err.message });
  }

  // Mark transaction as reconciled
  if (transactionId) {
    await supabase
      .from('transactions')
      .update({ reconciled: true, document_id: documentId, category })
      .eq('id', transactionId);
  }

  logger.info('Transaction reconciled', { companyId, documentId, transactionId, category });

  return { documentId, transactionId, category, accountCode, status: 'reconciled' };
}

async function createReconciliationCandidate(companyId, { documentId, supplier, amount, date, classification }) {
  logger.info('Creating reconciliation candidate', { companyId, documentId, supplier, amount });

  return {
    companyId,
    documentId,
    supplier,
    amount,
    date,
    classification,
    status: 'pending_reconciliation',
  };
}

async function reconcileManual(companyId, documentId, transactionId) {
  return reconcile(companyId, { documentId, transactionId, supplier: null, amount: null, classification: 'manual' });
}

module.exports = {
  findMatchingTransaction,
  reconcile,
  createReconciliationCandidate,
  reconcileManual,
};
