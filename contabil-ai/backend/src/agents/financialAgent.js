const getOpenAI = require('../config/openai');
const supabase = require('../config/supabase');
const logger = require('../config/logger');

const FINANCIAL_SYSTEM_PROMPT = `Voce e um analista financeiro especializado para escritorios de contabilidade brasileiros.
Analise os dados financeiros fornecidos e gere insights acionaveis.

Para cada analise, retorne um JSON valido com a seguinte estrutura:
{
  "insights": [
    {
      "type": "cash_flow_alert|revenue_trend|expense_trend|receivable_aging|payable_forecast|recommendation|financial_summary|anomaly",
      "severity": "info|warning|critical",
      "title": "titulo curto e claro",
      "description": "descricao detalhada com numeros e contexto",
      "data": { "valores relevantes" }
    }
  ],
  "summary": "resumo geral em 2-3 frases"
}

Regras:
- Sempre inclua valores monetarios formatados em BRL
- Identifique tendencias comparando periodos
- Alertas criticos: fluxo de caixa negativo em < 15 dias, inadimplencia > 30 dias
- Alertas de aviso: despesas crescendo > 15% mes a mes, receita caindo
- Recomendacoes devem ser praticas e especificas`;

async function analyzeCashFlow(companyId, financialData) {
  const { receivables, payables, cashBalance, projectedIncome, projectedExpenses } = financialData;

  const prompt = `Analise o fluxo de caixa desta empresa:

Saldo atual: R$ ${cashBalance?.toFixed(2) || '0.00'}
Contas a receber (proximo 30 dias): R$ ${receivables?.toFixed(2) || '0.00'}
Contas a pagar (proximo 30 dias): R$ ${payables?.toFixed(2) || '0.00'}
Receita projetada (30 dias): R$ ${projectedIncome?.toFixed(2) || '0.00'}
Despesas projetadas (30 dias): R$ ${projectedExpenses?.toFixed(2) || '0.00'}

Projete o fluxo de caixa para os proximos 30 dias e identifique riscos.`;

  return runAnalysis(companyId, prompt);
}

async function analyzeRevenueTrends(companyId, snapshots) {
  const monthlyData = snapshots.map((s) => ({
    date: s.snapshot_date,
    revenue: s.total_revenue,
    expenses: s.total_expenses,
  }));

  const prompt = `Analise a tendencia de receitas e despesas desta empresa:

Dados mensais (mais recente primeiro):
${monthlyData.map((d) => `${d.date}: Receita R$ ${d.revenue?.toFixed(2)} | Despesas R$ ${d.expenses?.toFixed(2)}`).join('\n')}

Identifique tendencias de receita e despesa, sazonalidade, e gere recomendacoes.`;

  return runAnalysis(companyId, prompt);
}

async function analyzeReceivableAging(companyId, receivables) {
  const prompt = `Analise o envelhecimento das contas a receber:

${JSON.stringify(receivables, null, 2)}

Classifique por faixas de atraso (corrente, 1-30 dias, 31-60 dias, 61-90 dias, >90 dias).
Identifique clientes com maior risco de inadimplencia e sugira acoes.`;

  return runAnalysis(companyId, prompt);
}

async function analyzePayableForecast(companyId, payables) {
  const prompt = `Analise as contas a pagar e faca previsao de saida de caixa:

${JSON.stringify(payables, null, 2)}

Agrupe por semana para os proximos 30 dias.
Identifique picos de pagamento e sugira melhor distribuicao.`;

  return runAnalysis(companyId, prompt);
}

async function generateFinancialSummary(companyId, snapshot) {
  const prompt = `Gere um resumo financeiro executivo com base nestes dados:

Receita total: R$ ${snapshot.total_revenue?.toFixed(2)}
Despesas totais: R$ ${snapshot.total_expenses?.toFixed(2)}
Saldo em caixa: R$ ${snapshot.cash_balance?.toFixed(2)}
Contas a receber: R$ ${snapshot.accounts_receivable?.toFixed(2)}
Contas a pagar: R$ ${snapshot.accounts_payable?.toFixed(2)}

Dados detalhados: ${JSON.stringify(snapshot.data)}

Inclua: resultado operacional, margem, indicadores chave, e 3 recomendacoes prioritarias.`;

  return runAnalysis(companyId, prompt);
}

async function runAnalysis(companyId, prompt) {
  try {
    // Enrich prompt with AI memory context
    let memoryContext = '';
    try {
      const memoryEngine = require('../memory/memoryEngine');
      memoryContext = await memoryEngine.getMemoryContext(companyId);
    } catch (err) {
      logger.warn('Failed to load memory context', { companyId, error: err.message });
    }

    const enrichedPrompt = memoryContext
      ? `${prompt}\n\n${memoryContext}`
      : prompt;

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: FINANCIAL_SYSTEM_PROMPT },
        { role: 'user', content: enrichedPrompt },
      ],
      temperature: 0.2,
      max_tokens: 2048,
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(response.choices[0].message.content);

    if (result.insights?.length) {
      await storeInsights(companyId, result.insights);
    }

    return result;
  } catch (err) {
    logger.error('Financial analysis failed', { companyId, error: err.message });
    throw err;
  }
}

async function storeInsights(companyId, insights) {
  const { data: company } = await supabase
    .from('companies')
    .select('office_id')
    .eq('id', companyId)
    .single();

  if (!company) return;

  const rows = insights.map((insight) => ({
    company_id: companyId,
    office_id: company.office_id,
    insight_type: insight.type,
    severity: insight.severity || 'info',
    title: insight.title,
    description: insight.description,
    data: insight.data || {},
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }));

  const { error } = await supabase.from('financial_insights').insert(rows);
  if (error) {
    logger.error('Failed to store insights', { companyId, error: error.message });
  } else {
    logger.info('Stored financial insights', { companyId, count: rows.length });
  }

  return rows;
}

async function getInsights(companyId, { type, severity, limit = 20 } = {}) {
  let query = supabase
    .from('financial_insights')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (type) query = query.eq('insight_type', type);
  if (severity) query = query.eq('severity', severity);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function getUnacknowledgedAlerts(officeId) {
  const { data, error } = await supabase
    .from('financial_insights')
    .select('*, company:companies(name)')
    .eq('office_id', officeId)
    .eq('acknowledged', false)
    .in('severity', ['warning', 'critical'])
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

async function acknowledgeInsight(insightId, userId) {
  const { data, error } = await supabase
    .from('financial_insights')
    .update({ acknowledged: true, acknowledged_by: userId, acknowledged_at: new Date().toISOString() })
    .eq('id', insightId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

module.exports = {
  analyzeCashFlow,
  analyzeRevenueTrends,
  analyzeReceivableAging,
  analyzePayableForecast,
  generateFinancialSummary,
  getInsights,
  getUnacknowledgedAlerts,
  acknowledgeInsight,
};
