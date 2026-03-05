const logger = require('../../config/logger');
const { addAlertJob } = require('../../queues');

async function assessRisk(companyId, { alertType, title, message, severity }) {
  // Use copilot risk detectors if available
  let detectedRisks = [];
  try {
    const copilotEngine = require('../../copilot/copilotEngine');
    const financialMemory = require('../../analysis/financialMemory');
    const context = await financialMemory.getCompanyFinancialContext(companyId);

    if (context.recentSnapshots?.length) {
      detectedRisks = copilotEngine.runRiskDetectors(context.recentSnapshots);
    }
  } catch (err) {
    logger.warn('Risk assessment via copilot failed', { companyId, error: err.message });
  }

  const confirmed = severity === 'critical' || detectedRisks.some((r) => r.severity === 'critical');

  return {
    companyId,
    alertType,
    title,
    message,
    severity: confirmed ? 'critical' : severity,
    confirmed,
    detectedRisks,
    assessedAt: new Date().toISOString(),
  };
}

async function evaluateCompanyRisks(companyId) {
  try {
    const copilotEngine = require('../../copilot/copilotEngine');
    const financialMemory = require('../../analysis/financialMemory');
    const context = await financialMemory.getCompanyFinancialContext(companyId);

    if (!context.recentSnapshots?.length) {
      return { companyId, risks: [], status: 'no_data' };
    }

    const risks = copilotEngine.runRiskDetectors(context.recentSnapshots);

    // Send alerts for critical risks
    for (const risk of risks.filter((r) => r.severity === 'critical')) {
      await sendAlert(companyId, {
        title: risk.risk_type.replace(/_/g, ' '),
        message: risk.recommendation,
        severity: 'critical',
      });
    }

    return { companyId, risks, status: 'evaluated' };
  } catch (err) {
    logger.error('Risk evaluation failed', { companyId, error: err.message });
    throw err;
  }
}

async function sendAlert(companyId, { title, message, severity }) {
  const supabase = require('../../config/supabase');
  const { data: company } = await supabase
    .from('companies')
    .select('office_id')
    .eq('id', companyId)
    .single();

  await addAlertJob({
    officeId: company?.office_id,
    companyId,
    alertType: 'risk_agent',
    title,
    message,
    severity,
    channels: ['dashboard', 'whatsapp'],
  });
}

module.exports = {
  assessRisk,
  evaluateCompanyRisks,
  sendAlert,
};
