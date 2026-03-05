const supabase = require('../config/supabase');
const logger = require('../config/logger');
const { addAlertJob } = require('../queues');

async function createTask(taskData) {
  const { data, error } = await supabase
    .from('tasks')
    .insert(taskData)
    .select()
    .single();

  if (error) {
    logger.error('Failed to create task', { error: error.message });
    throw error;
  }

  logger.info('Task created', { taskId: data.id, type: data.task_type });

  // Auto-alert for urgent tasks
  if (data.priority === 'urgent') {
    await addAlertJob({
      officeId: data.office_id,
      companyId: data.company_id,
      alertType: 'urgent_task',
      title: `Tarefa urgente: ${data.title}`,
      message: data.message || data.title,
      severity: 'critical',
      channels: ['dashboard', 'whatsapp'],
    }).catch((err) => logger.warn('Failed to queue urgent task alert', { error: err.message }));
  }

  return data;
}

async function createFromDocument(documentId, officeId, companyId, reason) {
  return createTask({
    office_id: officeId,
    company_id: companyId,
    task_type: 'document_review',
    title: `Revisar documento: ${reason}`,
    message: `Documento requer revisao manual. Motivo: ${reason}`,
    priority: 'medium',
    source_type: 'document',
    source_id: documentId,
  });
}

async function createFromEscalation(escalationData) {
  return createTask({
    office_id: escalationData.officeId,
    company_id: escalationData.companyId,
    task_type: 'escalation',
    title: escalationData.subject,
    message: escalationData.description,
    attachment: escalationData.filePath,
    priority: 'high',
    source_type: 'escalation',
  });
}

async function createFromAlert(alertData) {
  return createTask({
    office_id: alertData.officeId,
    company_id: alertData.companyId,
    task_type: 'alert_review',
    title: `Revisar alerta: ${alertData.title}`,
    message: alertData.message,
    priority: alertData.severity === 'critical' ? 'urgent' : 'high',
    source_type: 'alert',
    source_id: alertData.alertId,
  });
}

async function listTasks(officeId, { status, taskType, assignedTo, companyId, limit = 50, offset = 0 } = {}) {
  let query = supabase
    .from('tasks')
    .select('*, company:companies(name), assignee:users!tasks_assigned_to_fkey(name, email)', { count: 'exact' })
    .eq('office_id', officeId)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);
  if (taskType) query = query.eq('task_type', taskType);
  if (assignedTo) query = query.eq('assigned_to', assignedTo);
  if (companyId) query = query.eq('company_id', companyId);

  const { data, error, count } = await query;
  if (error) throw error;
  return { tasks: data, total: count };
}

async function getTask(taskId) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, company:companies(name), assignee:users!tasks_assigned_to_fkey(name, email)')
    .eq('id', taskId)
    .single();

  if (error) throw error;
  return data;
}

async function updateTask(taskId, updates) {
  if (updates.status === 'completed') {
    updates.completed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', taskId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function assignTask(taskId, userId) {
  return updateTask(taskId, { assigned_to: userId, status: 'in_progress' });
}

async function getTaskStats(officeId) {
  const { data, error } = await supabase
    .from('tasks')
    .select('status, priority')
    .eq('office_id', officeId);

  if (error) throw error;

  const stats = { total: data.length, pending: 0, in_progress: 0, completed: 0, cancelled: 0, urgent: 0 };
  for (const task of data) {
    stats[task.status]++;
    if (task.priority === 'urgent' && task.status !== 'completed') stats.urgent++;
  }
  return stats;
}

async function getOverdueTasks(officeId) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, company:companies(name)')
    .eq('office_id', officeId)
    .in('status', ['pending', 'in_progress'])
    .lt('due_date', new Date().toISOString())
    .order('due_date', { ascending: true });

  if (error) throw error;
  return data;
}

module.exports = {
  createTask,
  createFromDocument,
  createFromEscalation,
  createFromAlert,
  listTasks,
  getTask,
  updateTask,
  assignTask,
  getTaskStats,
  getOverdueTasks,
};
