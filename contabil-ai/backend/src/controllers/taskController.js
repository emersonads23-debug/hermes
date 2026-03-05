const taskService = require('../services/taskService');
const logger = require('../config/logger');

async function list(req, res) {
  try {
    const { status, task_type, assigned_to, company_id, limit, offset } = req.query;
    const result = await taskService.listTasks(req.user.office_id, {
      status,
      taskType: task_type,
      assignedTo: assigned_to,
      companyId: company_id,
      limit: Math.min(parseInt(limit, 10) || 50, 200),
      offset: parseInt(offset, 10) || 0,
    });
    res.json(result);
  } catch (err) {
    logger.error('Failed to list tasks', { error: err.message });
    res.status(500).json({ error: 'Erro ao listar tarefas' });
  }
}

async function get(req, res) {
  try {
    const task = await taskService.getTask(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tarefa nao encontrada' });
    res.json({ task });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar tarefa' });
  }
}

async function create(req, res) {
  try {
    const task = await taskService.createTask({
      office_id: req.user.office_id,
      ...req.body,
    });
    res.status(201).json({ task });
  } catch (err) {
    logger.error('Failed to create task', { error: err.message });
    res.status(500).json({ error: 'Erro ao criar tarefa' });
  }
}

async function update(req, res) {
  try {
    const task = await taskService.updateTask(req.params.id, req.body);
    res.json({ task });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar tarefa' });
  }
}

async function assign(req, res) {
  try {
    const task = await taskService.assignTask(req.params.id, req.body.user_id);
    res.json({ task });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atribuir tarefa' });
  }
}

async function stats(req, res) {
  try {
    const result = await taskService.getTaskStats(req.user.office_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar estatisticas' });
  }
}

module.exports = { list, get, create, update, assign, stats };
