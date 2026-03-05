const financialAgent = require('../agents/financialAgent');
const financialMemory = require('../analysis/financialMemory');
const alertEngine = require('../alerts/alertEngine');
const { addFinancialAnalysisJob } = require('../queues');
const logger = require('../config/logger');

async function getInsights(req, res) {
  try {
    const { company_id, type, severity, limit } = req.query;
    if (!company_id) return res.status(400).json({ error: 'company_id obrigatorio' });

    const insights = await financialAgent.getInsights(company_id, {
      type,
      severity,
      limit: parseInt(limit, 10) || 20,
    });
    res.json({ insights });
  } catch (err) {
    logger.error('Failed to get insights', { error: err.message });
    res.status(500).json({ error: 'Erro ao buscar insights' });
  }
}

async function getUnacknowledgedAlerts(req, res) {
  try {
    const alerts = await financialAgent.getUnacknowledgedAlerts(req.user.office_id);
    res.json({ alerts });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar alertas' });
  }
}

async function acknowledgeInsight(req, res) {
  try {
    const insight = await financialAgent.acknowledgeInsight(req.params.id, req.user.id);
    res.json({ insight });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao confirmar insight' });
  }
}

async function getSnapshots(req, res) {
  try {
    const { company_id, days } = req.query;
    if (!company_id) return res.status(400).json({ error: 'company_id obrigatorio' });

    const snapshots = await financialMemory.getSnapshots(company_id, {
      days: parseInt(days, 10) || 90,
    });
    res.json({ snapshots });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar snapshots' });
  }
}

async function getPatterns(req, res) {
  try {
    const { company_id } = req.query;
    if (!company_id) return res.status(400).json({ error: 'company_id obrigatorio' });

    const patterns = await financialMemory.getActivePatterns(company_id);
    res.json({ patterns });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar padroes' });
  }
}

async function getCompanyContext(req, res) {
  try {
    const context = await financialMemory.getCompanyFinancialContext(req.params.companyId);
    res.json(context);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar contexto financeiro' });
  }
}

async function triggerAnalysis(req, res) {
  try {
    const { company_id, type } = req.body;
    if (!company_id || !type) {
      return res.status(400).json({ error: 'company_id e type sao obrigatorios' });
    }

    const job = await addFinancialAnalysisJob(company_id, type, req.body.data || {});
    res.json({ jobId: job.id, message: 'Analise enfileirada com sucesso' });
  } catch (err) {
    logger.error('Failed to trigger analysis', { error: err.message });
    res.status(500).json({ error: 'Erro ao iniciar analise' });
  }
}

async function getAlerts(req, res) {
  try {
    const { unread_only } = req.query;
    const alerts = await alertEngine.getAlerts(req.user.office_id, {
      unreadOnly: unread_only === 'true',
    });
    res.json({ alerts });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar alertas' });
  }
}

async function markAlertRead(req, res) {
  try {
    const alert = await alertEngine.markAlertRead(req.params.id);
    res.json({ alert });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao marcar alerta como lido' });
  }
}

async function getAlertRules(req, res) {
  try {
    const rules = await alertEngine.getAlertRules(req.user.office_id);
    res.json({ rules });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar regras de alerta' });
  }
}

async function createAlertRule(req, res) {
  try {
    const rule = await alertEngine.createAlertRule({
      office_id: req.user.office_id,
      ...req.body,
    });
    res.status(201).json({ rule });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar regra de alerta' });
  }
}

async function updateAlertRule(req, res) {
  try {
    const rule = await alertEngine.updateAlertRule(req.params.id, req.body);
    res.json({ rule });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar regra de alerta' });
  }
}

module.exports = {
  getInsights,
  getUnacknowledgedAlerts,
  acknowledgeInsight,
  getSnapshots,
  getPatterns,
  getCompanyContext,
  triggerAnalysis,
  getAlerts,
  markAlertRead,
  getAlertRules,
  createAlertRule,
  updateAlertRule,
};
