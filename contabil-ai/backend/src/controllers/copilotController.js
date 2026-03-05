const copilotEngine = require('../copilot/copilotEngine');
const { addCopilotJob } = require('../queues');
const logger = require('../config/logger');

async function getSessions(req, res) {
  try {
    const { company_id, limit } = req.query;
    const sessions = await copilotEngine.getSessions(req.user.office_id, {
      companyId: company_id,
      limit: parseInt(limit, 10) || 20,
    });
    res.json({ sessions });
  } catch (err) {
    logger.error('Failed to get copilot sessions', { error: err.message });
    res.status(500).json({ error: 'Erro ao buscar sessoes do copilot' });
  }
}

async function getSessionDetail(req, res) {
  try {
    const actions = await copilotEngine.getSessionActions(req.params.id);
    res.json({ actions });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar detalhes da sessao' });
  }
}

async function getRecentActions(req, res) {
  try {
    const { severity, limit } = req.query;
    const actions = await copilotEngine.getRecentActions(req.user.office_id, {
      severity,
      limit: parseInt(limit, 10) || 30,
    });
    res.json({ actions });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar acoes do copilot' });
  }
}

async function triggerEvaluation(req, res) {
  try {
    const { company_id } = req.body;
    if (!company_id) {
      return res.status(400).json({ error: 'company_id obrigatorio' });
    }

    const job = await addCopilotJob(company_id, 'manual');
    res.json({ jobId: job.id, message: 'Avaliacao do copilot enfileirada' });
  } catch (err) {
    logger.error('Failed to trigger copilot', { error: err.message });
    res.status(500).json({ error: 'Erro ao iniciar avaliacao do copilot' });
  }
}

async function askCopilot(req, res) {
  try {
    const { company_id, question } = req.body;
    if (!company_id || !question) {
      return res.status(400).json({ error: 'company_id e question sao obrigatorios' });
    }

    const answer = await copilotEngine.answerFinancialQuery(company_id, question);
    res.json({ answer });
  } catch (err) {
    logger.error('Copilot query failed', { error: err.message });
    res.status(500).json({ error: 'Erro ao consultar copilot' });
  }
}

module.exports = {
  getSessions,
  getSessionDetail,
  getRecentActions,
  triggerEvaluation,
  askCopilot,
};
