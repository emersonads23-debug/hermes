const supabase = require('../config/supabase');
const logger = require('../config/logger');

async function evaluateRules(companyId, financialData) {
  const { data: rules } = await supabase
    .from('alert_rules')
    .select('*')
    .eq('active', true)
    .or(`company_id.eq.${companyId},company_id.is.null`)
    .order('created_at');

  if (!rules?.length) return [];

  const triggeredAlerts = [];

  for (const rule of rules) {
    const triggered = checkRule(rule, financialData);
    if (triggered) {
      triggeredAlerts.push({
        ruleId: rule.id,
        officeId: rule.office_id,
        companyId,
        alertType: rule.rule_type,
        title: triggered.title,
        message: triggered.message,
        severity: triggered.severity || 'warning',
        channels: rule.channels,
      });

      await supabase
        .from('alert_rules')
        .update({ last_triggered_at: new Date().toISOString() })
        .eq('id', rule.id);
    }
  }

  return triggeredAlerts;
}

function checkRule(rule, data) {
  const condition = rule.condition || {};

  switch (rule.rule_type) {
    case 'cash_flow_negative': {
      const daysUntilNegative = estimateDaysToNegativeCash(data);
      const threshold = condition.days_threshold || 15;
      if (daysUntilNegative !== null && daysUntilNegative <= threshold) {
        return {
          title: `Fluxo de caixa negativo em ${daysUntilNegative} dias`,
          message: `Com base nas contas a pagar e receitas projetadas, o caixa ficara negativo em aproximadamente ${daysUntilNegative} dias. Saldo atual: R$ ${data.cashBalance?.toFixed(2)}`,
          severity: daysUntilNegative <= 7 ? 'critical' : 'warning',
        };
      }
      return null;
    }

    case 'invoice_overdue': {
      const overdueAmount = data.overdueReceivables || 0;
      const threshold = condition.amount_threshold || 1000;
      if (overdueAmount > threshold) {
        return {
          title: `Faturas vencidas: R$ ${overdueAmount.toFixed(2)}`,
          message: `Existem faturas vencidas totalizando R$ ${overdueAmount.toFixed(2)}. ${data.overdueCount || 0} faturas em atraso.`,
          severity: overdueAmount > threshold * 5 ? 'critical' : 'warning',
        };
      }
      return null;
    }

    case 'expense_spike': {
      const percentThreshold = condition.percent_threshold || 20;
      if (data.expenseGrowthPercent > percentThreshold) {
        return {
          title: `Despesas aumentaram ${data.expenseGrowthPercent.toFixed(1)}%`,
          message: `As despesas cresceram ${data.expenseGrowthPercent.toFixed(1)}% em relacao ao periodo anterior. Despesas atuais: R$ ${data.totalExpenses?.toFixed(2)}`,
          severity: data.expenseGrowthPercent > percentThreshold * 2 ? 'critical' : 'warning',
        };
      }
      return null;
    }

    case 'revenue_drop': {
      const percentThreshold = condition.percent_threshold || 15;
      if (data.revenueDropPercent > percentThreshold) {
        return {
          title: `Receita caiu ${data.revenueDropPercent.toFixed(1)}%`,
          message: `A receita caiu ${data.revenueDropPercent.toFixed(1)}% em relacao ao periodo anterior. Receita atual: R$ ${data.totalRevenue?.toFixed(2)}`,
          severity: data.revenueDropPercent > percentThreshold * 2 ? 'critical' : 'warning',
        };
      }
      return null;
    }

    case 'payment_due': {
      const daysAhead = condition.days_ahead || 3;
      const upcomingPayments = data.paymentsInNextDays?.[daysAhead] || 0;
      const threshold = condition.amount_threshold || 5000;
      if (upcomingPayments > threshold) {
        return {
          title: `R$ ${upcomingPayments.toFixed(2)} em pagamentos nos proximos ${daysAhead} dias`,
          message: `Pagamentos proximos: R$ ${upcomingPayments.toFixed(2)} vencem nos proximos ${daysAhead} dias. Verifique a disponibilidade de caixa.`,
          severity: 'warning',
        };
      }
      return null;
    }

    default:
      return null;
  }
}

function estimateDaysToNegativeCash(data) {
  const { cashBalance, dailyBurnRate } = data;
  if (!cashBalance || !dailyBurnRate || dailyBurnRate <= 0) return null;
  if (cashBalance <= 0) return 0;
  return Math.floor(cashBalance / dailyBurnRate);
}

async function deliverAlert(alertData) {
  const { ruleId, officeId, companyId, alertType, title, message, severity, channels = ['dashboard'] } = alertData;

  const delivered = {};

  // Always store in alert_history (dashboard notification)
  const { data: alert, error } = await supabase
    .from('alert_history')
    .insert({
      rule_id: ruleId || null,
      office_id: officeId,
      company_id: companyId,
      alert_type: alertType,
      title,
      message,
      severity,
      channels,
      delivered: {},
    })
    .select()
    .single();

  if (error) {
    logger.error('Failed to store alert', { error: error.message });
    throw error;
  }

  delivered.dashboard = true;

  // WhatsApp delivery
  if (channels.includes('whatsapp')) {
    try {
      const { data: office } = await supabase
        .from('offices')
        .select('phone')
        .eq('id', officeId)
        .single();

      if (office?.phone) {
        const whatsappService = require('../services/whatsappService');
        const alertEmoji = severity === 'critical' ? '🚨' : '⚠️';
        await whatsappService.sendText(
          office.phone,
          `${alertEmoji} *ContabilAI Alerta*\n\n*${title}*\n\n${message}`
        );
        delivered.whatsapp = true;
      }
    } catch (err) {
      logger.warn('WhatsApp alert delivery failed', { alertId: alert.id, error: err.message });
      delivered.whatsapp = false;
    }
  }

  // Email delivery
  if (channels.includes('email')) {
    try {
      const nodemailer = require('nodemailer');
      const env = require('../config/env');

      const transporter = nodemailer.createTransport({
        host: env.smtp.host,
        port: env.smtp.port,
        secure: env.smtp.port === 465,
        auth: { user: env.smtp.user, pass: env.smtp.pass },
      });

      const { data: office } = await supabase
        .from('offices')
        .select('email, name')
        .eq('id', officeId)
        .single();

      if (office?.email) {
        await transporter.sendMail({
          from: env.smtp.from,
          to: office.email,
          subject: `[ContabilAI ${severity.toUpperCase()}] ${title}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;">
              <h2 style="color:${severity === 'critical' ? '#dc2626' : '#f59e0b'}">${title}</h2>
              <p>${message}</p>
              <hr>
              <p style="color:#6b7280;font-size:0.875rem;">Escritorio: ${office.name} | ${new Date().toLocaleString('pt-BR')}</p>
            </div>
          `,
        });
        delivered.email = true;
      }
    } catch (err) {
      logger.warn('Email alert delivery failed', { alertId: alert.id, error: err.message });
      delivered.email = false;
    }
  }

  // Update delivered status
  await supabase
    .from('alert_history')
    .update({ delivered })
    .eq('id', alert.id);

  logger.info('Alert delivered', { alertId: alert.id, channels: Object.keys(delivered) });
  return alert;
}

async function getAlerts(officeId, { unreadOnly = false, limit = 50 } = {}) {
  let query = supabase
    .from('alert_history')
    .select('*, company:companies(name)')
    .eq('office_id', officeId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (unreadOnly) query = query.eq('read', false);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function markAlertRead(alertId) {
  const { data, error } = await supabase
    .from('alert_history')
    .update({ read: true, read_at: new Date().toISOString() })
    .eq('id', alertId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getAlertRules(officeId) {
  const { data, error } = await supabase
    .from('alert_rules')
    .select('*')
    .eq('office_id', officeId)
    .order('created_at');

  if (error) throw error;
  return data;
}

async function createAlertRule(ruleData) {
  const { data, error } = await supabase
    .from('alert_rules')
    .insert(ruleData)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updateAlertRule(ruleId, updates) {
  const { data, error } = await supabase
    .from('alert_rules')
    .update(updates)
    .eq('id', ruleId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

module.exports = {
  evaluateRules,
  deliverAlert,
  getAlerts,
  markAlertRead,
  getAlertRules,
  createAlertRule,
  updateAlertRule,
};
