const openai = require('../config/openai');
const supabase = require('../config/supabase');
const logger = require('../config/logger');
const financialMemory = require('../analysis/financialMemory');
const { addAlertJob } = require('../queues');

// ============================================================
// Risk Detectors
// ============================================================

function detectNegativeCashFlow(snapshot) {
  const cash = Number(snapshot.cash_balance || 0);
  const payable = Number(snapshot.accounts_payable || 0);
  const receivable = Number(snapshot.accounts_receivable || 0);
  const dailyBurn = Number(snapshot.total_expenses || 0) / 30;

  if (cash <= 0) {
    return { risk_type: 'negative_cash_flow', severity: 'critical', recommendation: `Caixa negativo: R$ ${cash.toFixed(2)}. Priorize cobranca de R$ ${receivable.toFixed(2)} em contas a receber.` };
  }

  if (dailyBurn > 0) {
    const daysUntilNegative = Math.floor(cash / dailyBurn);
    if (daysUntilNegative <= 7) {
      return { risk_type: 'negative_cash_flow', severity: 'critical', recommendation: `Caixa ficara negativo em ${daysUntilNegative} dias. Burn rate diario: R$ ${dailyBurn.toFixed(2)}.` };
    }
    if (daysUntilNegative <= 15) {
      return { risk_type: 'negative_cash_flow', severity: 'warning', recommendation: `Caixa ficara negativo em ${daysUntilNegative} dias. Avalie renegociar prazos de pagamento.` };
    }
  }

  return null;
}

function detectExpenseSpike(snapshots) {
  if (snapshots.length < 2) return null;

  const current = Number(snapshots[0].total_expenses || 0);
  const previous = Number(snapshots[1].total_expenses || 0);

  if (previous <= 0) return null;

  const growthPercent = ((current - previous) / previous) * 100;

  if (growthPercent > 30) {
    return { risk_type: 'expense_spike', severity: 'critical', recommendation: `Despesas subiram ${growthPercent.toFixed(1)}% (R$ ${previous.toFixed(2)} -> R$ ${current.toFixed(2)}). Investigar categorias com maior aumento.` };
  }
  if (growthPercent > 15) {
    return { risk_type: 'expense_spike', severity: 'warning', recommendation: `Despesas cresceram ${growthPercent.toFixed(1)}% em relacao ao periodo anterior. Monitorar tendencia.` };
  }

  return null;
}

function detectRevenueDecline(snapshots) {
  if (snapshots.length < 2) return null;

  const current = Number(snapshots[0].total_revenue || 0);
  const previous = Number(snapshots[1].total_revenue || 0);

  if (previous <= 0) return null;

  const dropPercent = ((previous - current) / previous) * 100;

  if (dropPercent > 25) {
    return { risk_type: 'revenue_decline', severity: 'critical', recommendation: `Receita caiu ${dropPercent.toFixed(1)}% (R$ ${previous.toFixed(2)} -> R$ ${current.toFixed(2)}). Revisar pipeline de vendas e contratos.` };
  }
  if (dropPercent > 10) {
    return { risk_type: 'revenue_decline', severity: 'warning', recommendation: `Receita diminuiu ${dropPercent.toFixed(1)}%. Acompanhar nos proximos dias.` };
  }

  return null;
}

function detectHighReceivableAging(snapshot) {
  const receivable = Number(snapshot.accounts_receivable || 0);
  const revenue = Number(snapshot.total_revenue || 0);

  if (revenue <= 0 || receivable <= 0) return null;

  const dso = (receivable / revenue) * 30;

  if (dso > 60) {
    return { risk_type: 'high_receivable_aging', severity: 'critical', recommendation: `DSO de ${dso.toFixed(0)} dias. Contas a receber de R$ ${receivable.toFixed(2)} sao ${(receivable / revenue * 100).toFixed(0)}% da receita. Intensificar cobrancas.` };
  }
  if (dso > 35) {
    return { risk_type: 'high_receivable_aging', severity: 'warning', recommendation: `DSO de ${dso.toFixed(0)} dias esta acima do ideal. Revisar politica de credito.` };
  }

  return null;
}

function detectLargeUnpaidInvoices(snapshot) {
  const payable = Number(snapshot.accounts_payable || 0);
  const cash = Number(snapshot.cash_balance || 0);

  if (payable <= 0) return null;

  if (cash > 0 && payable > cash * 1.5) {
    return { risk_type: 'large_unpaid_invoices', severity: 'critical', recommendation: `Contas a pagar (R$ ${payable.toFixed(2)}) superam o caixa (R$ ${cash.toFixed(2)}) em ${((payable / cash - 1) * 100).toFixed(0)}%. Risco de inadimplencia.` };
  }
  if (cash > 0 && payable > cash) {
    return { risk_type: 'large_unpaid_invoices', severity: 'warning', recommendation: `Contas a pagar (R$ ${payable.toFixed(2)}) maiores que caixa disponivel (R$ ${cash.toFixed(2)}). Planejar fluxo.` };
  }

  return null;
}

const ALL_DETECTORS = [
  detectNegativeCashFlow,
  detectExpenseSpike,
  detectRevenueDecline,
  detectHighReceivableAging,
  detectLargeUnpaidInvoices,
];

function runRiskDetectors(snapshots) {
  const risks = [];
  const latest = snapshots[0];
  if (!latest) return risks;

  for (const detector of ALL_DETECTORS) {
    try {
      const result = detector.length > 1 ? detector(snapshots) : detector(latest);
      if (result) risks.push(result);
    } catch (err) {
      logger.warn('Risk detector error', { detector: detector.name, error: err.message });
    }
  }

  return risks;
}

// ============================================================
// GPT-4o Copilot Reasoning
// ============================================================

const COPILOT_SYSTEM_PROMPT = `Voce e o Copilot Financeiro do ContabilAI, um assistente autonomo que analisa dados financeiros de empresas.

Sua funcao:
1. Analisar os dados financeiros fornecidos (snapshots, insights, padroes, riscos detectados)
2. Gerar um resumo executivo em 2-3 frases
3. Produzir ate 5 recomendacoes priorizadas e acionaveis
4. Decidir quais alertas devem ser enviados

Retorne JSON:
{
  "summary": "resumo executivo conciso",
  "recommendations": [
    {
      "priority": 1,
      "title": "titulo curto",
      "description": "acao especifica recomendada",
      "category": "cash_flow|expenses|revenue|receivables|payables|general"
    }
  ],
  "alerts": [
    {
      "title": "titulo do alerta",
      "message": "mensagem do alerta",
      "severity": "warning|critical",
      "channels": ["dashboard", "whatsapp", "email"]
    }
  ]
}

Regras:
- Recomendacoes devem ser praticas e especificas com valores em BRL
- Alertas criticos: so quando ha risco iminente (< 7 dias) para a empresa
- Alertas de aviso: riscos que precisam de atencao em 7-30 dias
- Nao gere mais de 2 alertas por analise
- Se nao houver riscos significativos, retorne lista de alertas vazia`;

async function runCopilotReasoning(companyId, context) {
  const { latestSnapshot, recentSnapshots, activePatterns, recentInsights, detectedRisks } = context;

  const prompt = `Analise financeira da empresa:

Snapshot mais recente:
- Receita: R$ ${Number(latestSnapshot.total_revenue || 0).toFixed(2)}
- Despesas: R$ ${Number(latestSnapshot.total_expenses || 0).toFixed(2)}
- Caixa: R$ ${Number(latestSnapshot.cash_balance || 0).toFixed(2)}
- A Receber: R$ ${Number(latestSnapshot.accounts_receivable || 0).toFixed(2)}
- A Pagar: R$ ${Number(latestSnapshot.accounts_payable || 0).toFixed(2)}

Riscos detectados automaticamente:
${detectedRisks.length > 0 ? detectedRisks.map((r) => `- [${r.severity.toUpperCase()}] ${r.risk_type}: ${r.recommendation}`).join('\n') : '- Nenhum risco critico detectado'}

Padroes ativos:
${activePatterns.length > 0 ? activePatterns.map((p) => `- ${p.pattern_type} (${p.confidence}%): ${p.description}`).join('\n') : '- Nenhum padrao identificado'}

Insights recentes:
${recentInsights.slice(0, 5).map((i) => `- [${i.severity}] ${i.title}`).join('\n') || '- Nenhum insight recente'}

Historico (ultimos ${recentSnapshots.length} snapshots):
${recentSnapshots.slice(0, 7).map((s) => `${s.snapshot_date}: Rev=${Number(s.total_revenue).toFixed(0)} Desp=${Number(s.total_expenses).toFixed(0)} Caixa=${Number(s.cash_balance).toFixed(0)}`).join('\n')}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: COPILOT_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    max_tokens: 1500,
    response_format: { type: 'json_object' },
  });

  return JSON.parse(response.choices[0].message.content);
}

// ============================================================
// Copilot WhatsApp Query Handler
// ============================================================

const COPILOT_QUERY_PROMPT = `Voce e o Copilot Financeiro do ContabilAI respondendo uma pergunta via WhatsApp.
Responda de forma clara e concisa (max 500 caracteres).
Use emojis com moderacao para facilitar leitura no celular.
Inclua valores em BRL quando relevante.
Se nao houver dados suficientes, informe com clareza.`;

async function answerFinancialQuery(companyId, question) {
  const context = await financialMemory.getCompanyFinancialContext(companyId);

  if (!context.latestSnapshot) {
    return 'Ainda nao temos dados financeiros suficientes para esta empresa. Os dados serao coletados na proxima analise diaria.';
  }

  const s = context.latestSnapshot;
  const prompt = `Pergunta: ${question}

Dados financeiros atuais:
- Receita: R$ ${Number(s.total_revenue || 0).toFixed(2)}
- Despesas: R$ ${Number(s.total_expenses || 0).toFixed(2)}
- Caixa: R$ ${Number(s.cash_balance || 0).toFixed(2)}
- A Receber: R$ ${Number(s.accounts_receivable || 0).toFixed(2)}
- A Pagar: R$ ${Number(s.accounts_payable || 0).toFixed(2)}

${context.activePatterns.length > 0 ? `Padroes: ${context.activePatterns.map((p) => p.description).join('; ')}` : ''}
${context.recentInsights.length > 0 ? `Alertas recentes: ${context.recentInsights.slice(0, 3).map((i) => i.title).join('; ')}` : ''}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: COPILOT_QUERY_PROMPT },
      { role: 'user', content: prompt },
    ],
    temperature: 0.3,
    max_tokens: 300,
  });

  return response.choices[0].message.content;
}

// ============================================================
// Main Copilot Evaluation
// ============================================================

async function evaluateCompany(companyId, triggerType = 'daily') {
  const startTime = Date.now();

  const { data: company } = await supabase
    .from('companies')
    .select('office_id, name')
    .eq('id', companyId)
    .single();

  if (!company) throw new Error(`Company ${companyId} not found`);

  // Create session
  const { data: session } = await supabase
    .from('copilot_sessions')
    .insert({
      company_id: companyId,
      office_id: company.office_id,
      trigger_type: triggerType,
      status: 'running',
    })
    .select()
    .single();

  try {
    // Gather context
    const context = await financialMemory.getCompanyFinancialContext(companyId);

    if (!context.latestSnapshot) {
      await completeSession(session.id, {
        status: 'completed',
        summary: 'Sem dados financeiros disponiveis para analise.',
        duration_ms: Date.now() - startTime,
      });
      return { session, skipped: true };
    }

    // Run risk detectors
    const detectedRisks = runRiskDetectors(context.recentSnapshots);
    context.detectedRisks = detectedRisks;

    // Log risk actions
    for (const risk of detectedRisks) {
      await logAction(session.id, companyId, company.office_id, {
        action_type: 'risk_detected',
        risk_type: risk.risk_type,
        severity: risk.severity,
        description: risk.recommendation,
      });
    }

    // Run GPT-4o reasoning
    const reasoning = await runCopilotReasoning(companyId, context);

    // Log recommendation actions
    for (const rec of reasoning.recommendations || []) {
      await logAction(session.id, companyId, company.office_id, {
        action_type: 'recommendation',
        severity: 'info',
        description: `[${rec.category}] ${rec.title}: ${rec.description}`,
        data: rec,
      });
    }

    // Process alerts
    let alertsSent = 0;
    for (const alert of reasoning.alerts || []) {
      await addAlertJob({
        officeId: company.office_id,
        companyId,
        alertType: 'copilot',
        title: alert.title,
        message: alert.message,
        severity: alert.severity,
        channels: alert.channels || ['dashboard'],
      });

      await logAction(session.id, companyId, company.office_id, {
        action_type: 'alert_sent',
        severity: alert.severity,
        description: alert.title,
        data: { message: alert.message, channels: alert.channels },
      });
      alertsSent++;
    }

    // Create tasks for critical risks
    const criticalRisks = detectedRisks.filter((r) => r.severity === 'critical');
    let tasksCreated = 0;
    if (criticalRisks.length > 0) {
      try {
        const taskManager = require('../tasks/taskManager');
        for (const risk of criticalRisks) {
          await taskManager.createTask({
            office_id: company.office_id,
            company_id: companyId,
            task_type: 'alert_review',
            title: `Copilot: ${risk.risk_type.replace(/_/g, ' ')}`,
            message: risk.recommendation,
            priority: 'urgent',
            source_type: 'copilot',
            source_id: session.id,
          });

          await logAction(session.id, companyId, company.office_id, {
            action_type: 'task_created',
            risk_type: risk.risk_type,
            severity: 'critical',
            description: `Tarefa criada: ${risk.recommendation}`,
          });
          tasksCreated++;
        }
      } catch (err) {
        logger.warn('Copilot task creation failed', { error: err.message });
      }
    }

    // Complete session
    const result = await completeSession(session.id, {
      status: 'completed',
      summary: reasoning.summary,
      recommendations: reasoning.recommendations || [],
      risks_detected: detectedRisks.length,
      actions_taken: alertsSent + tasksCreated,
      duration_ms: Date.now() - startTime,
    });

    logger.info('Copilot evaluation completed', {
      companyId,
      sessionId: session.id,
      risks: detectedRisks.length,
      alerts: alertsSent,
      tasks: tasksCreated,
      durationMs: Date.now() - startTime,
    });

    return { session: result, reasoning, detectedRisks };
  } catch (err) {
    await completeSession(session.id, {
      status: 'failed',
      error: err.message,
      duration_ms: Date.now() - startTime,
    });
    throw err;
  }
}

async function completeSession(sessionId, updates) {
  updates.completed_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('copilot_sessions')
    .update(updates)
    .eq('id', sessionId)
    .select()
    .single();

  if (error) logger.error('Failed to update copilot session', { sessionId, error: error.message });
  return data;
}

async function logAction(sessionId, companyId, officeId, action) {
  const { error } = await supabase.from('copilot_actions').insert({
    session_id: sessionId,
    company_id: companyId,
    office_id: officeId,
    ...action,
  });
  if (error) logger.warn('Failed to log copilot action', { error: error.message });
}

// ============================================================
// Query methods
// ============================================================

async function getSessions(officeId, { companyId, limit = 20 } = {}) {
  let query = supabase
    .from('copilot_sessions')
    .select('*, company:companies(name)')
    .eq('office_id', officeId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (companyId) query = query.eq('company_id', companyId);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function getSessionActions(sessionId) {
  const { data, error } = await supabase
    .from('copilot_actions')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

async function getRecentActions(officeId, { severity, limit = 30 } = {}) {
  let query = supabase
    .from('copilot_actions')
    .select('*, company:companies(name), session:copilot_sessions(trigger_type)')
    .eq('office_id', officeId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (severity) query = query.eq('severity', severity);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

module.exports = {
  evaluateCompany,
  answerFinancialQuery,
  runRiskDetectors,
  getSessions,
  getSessionActions,
  getRecentActions,
};
