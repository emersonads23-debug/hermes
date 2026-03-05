const escalationService = require('../services/escalationService');
const logger = require('../config/logger');

async function list(req, res) {
  try {
    const officeId = req.user.role === 'superadmin'
      ? req.query.office_id
      : req.user.office_id;

    const tasks = await escalationService.listEscalations(officeId, req.query.status);
    res.json({ tasks });
  } catch (err) {
    logger.error('Failed to list escalations', { error: err.message });
    res.status(500).json({ error: 'Failed to list escalations' });
  }
}

async function update(req, res) {
  try {
    const task = await escalationService.updateEscalation(req.params.id, req.body);
    res.json({ task });
  } catch (err) {
    logger.error('Failed to update escalation', { id: req.params.id, error: err.message });
    res.status(500).json({ error: 'Failed to update escalation' });
  }
}

module.exports = { list, update };
