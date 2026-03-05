const nodemailer = require('nodemailer');
const supabase = require('../config/supabase');
const env = require('../config/env');
const logger = require('../config/logger');

const transporter = nodemailer.createTransport({
  host: env.smtp.host,
  port: env.smtp.port,
  secure: env.smtp.port === 465,
  auth: { user: env.smtp.user, pass: env.smtp.pass },
});

async function createEscalation({ officeId, companyId, userPhone, subject, description, filePath }) {
  const { data: task, error } = await supabase
    .from('escalation_tasks')
    .insert({
      office_id: officeId,
      company_id: companyId,
      user_phone: userPhone,
      subject,
      description,
      file_path: filePath || null,
      status: 'open',
    })
    .select()
    .single();

  if (error) {
    logger.error('Failed to create escalation task', { error: error.message });
    throw error;
  }

  await sendEscalationEmail(task);
  return task;
}

async function sendEscalationEmail(task) {
  const { data: office } = await supabase
    .from('offices')
    .select('name, email')
    .eq('id', task.office_id)
    .single();

  const to = office?.email || env.escalationEmail;

  const mailOptions = {
    from: env.smtp.from,
    to,
    subject: `[ContabilAI] Escalacao: ${task.subject}`,
    html: `
      <h2>Nova escalacao - ContabilAI</h2>
      <p><strong>Escritorio:</strong> ${office?.name || 'N/A'}</p>
      <p><strong>Telefone do cliente:</strong> ${task.user_phone}</p>
      <p><strong>Assunto:</strong> ${task.subject}</p>
      <p><strong>Descricao:</strong></p>
      <p>${task.description}</p>
      <p><strong>ID da tarefa:</strong> ${task.id}</p>
      <hr>
      <p>Acesse o painel para mais detalhes.</p>
    `,
    attachments: task.file_path
      ? [{ path: task.file_path }]
      : [],
  };

  try {
    await transporter.sendMail(mailOptions);
    logger.info('Escalation email sent', { taskId: task.id, to });
  } catch (err) {
    logger.error('Failed to send escalation email', { error: err.message });
  }
}

async function listEscalations(officeId, status = null) {
  let query = supabase
    .from('escalation_tasks')
    .select('*, company:companies(name)')
    .eq('office_id', officeId)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function updateEscalation(id, updates) {
  const { data, error } = await supabase
    .from('escalation_tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

module.exports = { createEscalation, listEscalations, updateEscalation };
