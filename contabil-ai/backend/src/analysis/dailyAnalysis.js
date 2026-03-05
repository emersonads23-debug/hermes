const supabase = require('../config/supabase');
const logger = require('../config/logger');
const financialMemory = require('./financialMemory');
const financialAgent = require('../agents/financialAgent');
const alertEngine = require('../alerts/alertEngine');
const { addAlertJob } = require('../queues');

const BATCH_SIZE = 10;

async function runDailyAnalysis() {
  logger.info('Starting daily financial analysis');
  const startTime = Date.now();

  const { data: companies, error } = await supabase
    .from('companies')
    .select('id, office_id, name')
    .eq('active', true);

  if (error || !companies?.length) {
    logger.warn('No active companies found for analysis');
    return;
  }

  logger.info(`Analyzing ${companies.length} companies`);

  let processed = 0;
  let failed = 0;

  // Process in batches
  for (let i = 0; i < companies.length; i += BATCH_SIZE) {
    const batch = companies.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(
      batch.map(async (company) => {
        try {
          await analyzeCompany(company);
          processed++;
        } catch (err) {
          failed++;
          logger.error('Company analysis failed', {
            companyId: company.id,
            name: company.name,
            error: err.message,
          });
        }
      })
    );
  }

  const duration = Math.round((Date.now() - startTime) / 1000);
  logger.info('Daily analysis completed', { processed, failed, total: companies.length, durationSeconds: duration });
}

async function analyzeCompany(company) {
  // Step 1: Fetch financial data from ERP integrations
  const financialData = await fetchERPData(company);

  if (!financialData) {
    logger.debug('No ERP data available', { companyId: company.id });
    return;
  }

  // Step 2: Save financial snapshot
  const snapshot = await financialMemory.saveSnapshot(
    company.id,
    company.office_id,
    financialData
  );

  // Step 3: Run AI analysis
  const analysis = await financialAgent.generateFinancialSummary(company.id, snapshot);

  // Step 4: Detect patterns (weekly — only on Mondays)
  const today = new Date();
  if (today.getDay() === 1) {
    await financialMemory.detectPatterns(company.id);
  }

  // Step 5: Evaluate alert rules and send alerts
  const alerts = await alertEngine.evaluateRules(company.id, financialData);
  for (const alert of alerts) {
    await addAlertJob(alert);
  }

  return { snapshot, analysis, alertCount: alerts.length };
}

async function fetchERPData(company) {
  const { data: tokens } = await supabase
    .from('integration_tokens')
    .select('provider')
    .eq('office_id', company.office_id);

  if (!tokens?.length) return null;

  const providers = tokens.map((t) => t.provider);
  let financialData = {};

  try {
    if (providers.includes('omie')) {
      const omieService = require('../services/omieService');
      const [payable, receivable] = await Promise.allSettled([
        omieService.getAccountsPayable(company.office_id),
        omieService.getAccountsReceivable(company.office_id),
      ]);

      const payableData = payable.status === 'fulfilled' ? payable.value : null;
      const receivableData = receivable.status === 'fulfilled' ? receivable.value : null;

      financialData = {
        ...financialData,
        totalExpenses: sumOmieValues(payableData),
        totalRevenue: sumOmieValues(receivableData),
        accountsPayable: sumOmiePending(payableData),
        accountsReceivable: sumOmiePending(receivableData),
        source: 'omie',
      };
    }

    if (providers.includes('conta_azul')) {
      const contaAzulService = require('../services/contaAzulService');
      try {
        const summary = await contaAzulService.getFinancialSummary(company.office_id);
        financialData = {
          ...financialData,
          receivablesDetail: summary.receivables,
          payablesDetail: summary.payables,
          source: financialData.source ? `${financialData.source}+conta_azul` : 'conta_azul',
        };
      } catch {
        // Conta Azul token might be expired
      }
    }
  } catch (err) {
    logger.warn('ERP data fetch partial failure', { companyId: company.id, error: err.message });
  }

  // Calculate derived metrics
  financialData.cashBalance = (financialData.totalRevenue || 0) - (financialData.totalExpenses || 0);
  financialData.dailyBurnRate = (financialData.totalExpenses || 0) / 30;

  return Object.keys(financialData).length > 2 ? financialData : null;
}

function sumOmieValues(data) {
  if (!data?.conta_pagar_cadastro && !data?.conta_receber_cadastro) return 0;
  const items = data.conta_pagar_cadastro || data.conta_receber_cadastro || [];
  return items.reduce((sum, item) => sum + (item.valor_documento || 0), 0);
}

function sumOmiePending(data) {
  if (!data?.conta_pagar_cadastro && !data?.conta_receber_cadastro) return 0;
  const items = data.conta_pagar_cadastro || data.conta_receber_cadastro || [];
  return items
    .filter((item) => item.status_titulo === 'ABERTO' || !item.data_pagamento)
    .reduce((sum, item) => sum + (item.valor_documento || 0), 0);
}

module.exports = { runDailyAnalysis, analyzeCompany };
