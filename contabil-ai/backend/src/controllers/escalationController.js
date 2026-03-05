const escalationService = require('../services/escalationService');

async function list(req, res) {
  const officeId = req.user.role === 'superadmin'
    ? req.query.office_id
    : req.user.office_id;

  const tasks = await escalationService.listEscalations(officeId, req.query.status);
  res.json({ tasks });
}

async function update(req, res) {
  const task = await escalationService.updateEscalation(req.params.id, req.body);
  res.json({ task });
}

module.exports = { list, update };
