const openai = require('../config/openai');
const supabase = require('../config/supabase');
const logger = require('../config/logger');

async function saveSnapshot(companyId, officeId, financialData) {
  const today = new Date().toISOString().split('T')[0];

  const row = {
    company_id: companyId,
    office_id: officeId,
    snapshot_date: today,
    data: financialData,
    total_revenue: financialData.totalRevenue || 0,
    total_expenses: financialData.totalExpenses || 0,
    cash_balance: financialData.cashBalance || 0,
    accounts_receivable: financialData.accountsReceivable || 0,
    accounts_payable: financialData.accountsPayable || 0,
  };

  const { data, error } = await supabase
    .from('financial_snapshots')
    .upsert(row, { onConflict: 'company_id,snapshot_date' })
    .select()
    .single();

  if (error) {
    logger.error('Failed to save financial snapshot', { companyId, error: error.message });
    throw error;
  }

  logger.info('Financial snapshot saved', { companyId, date: today });
  return data;
}

async function getSnapshots(companyId, { days = 90, limit = 90 } = {}) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('financial_snapshots')
    .select('*')
    .eq('company_id', companyId)
    .gte('snapshot_date', since)
    .order('snapshot_date', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

async function detectPatterns(companyId) {
  const snapshots = await getSnapshots(companyId, { days: 180 });

  if (snapshots.length < 14) {
    logger.info('Not enough data for pattern detection', { companyId, snapshotCount: snapshots.length });
    return [];
  }

  const { data: company } = await supabase
    .from('companies')
    .select('office_id, name')
    .eq('id', companyId)
    .single();

  if (!company) return [];

  const timeSeriesData = snapshots
    .reverse()
    .map((s) => ({
      date: s.snapshot_date,
      revenue: Number(s.total_revenue),
      expenses: Number(s.total_expenses),
      cash: Number(s.cash_balance),
      receivable: Number(s.accounts_receivable),
      payable: Number(s.accounts_payable),
    }));

  const prompt = `Analise esta serie temporal financeira e detecte padroes:

Empresa: ${company.name}
Dados (${timeSeriesData.length} pontos):
${timeSeriesData.map((d) => `${d.date}: Rev=${d.revenue} Desp=${d.expenses} Caixa=${d.cash} CR=${d.receivable} CP=${d.payable}`).join('\n')}

Detecte os seguintes tipos de padroes:
- seasonality: sazonalidade (meses com receita consistentemente maior/menor)
- declining_revenue: tendencia de queda na receita
- increasing_expenses: tendencia de aumento nas despesas
- payment_delay: atraso crescente nos pagamentos (contas a pagar crescendo)
- growth_trend: tendencia de crescimento sustentavel
- cash_flow_cycle: ciclo de fluxo de caixa (dias entre receber e pagar)
- expense_spike: pico anomalo de despesas
- revenue_concentration: concentracao de receita em poucos periodos

Retorne JSON:
{
  "patterns": [
    {
      "type": "tipo_do_padrao",
      "description": "descricao detalhada",
      "confidence": 85.5,
      "data": { "detalhes_especificos" }
    }
  ]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'Voce e um analista financeiro que detecta padroes em series temporais. Retorne apenas JSON valido.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 2048,
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(response.choices[0].message.content);
    const patterns = result.patterns || [];

    // Deactivate old patterns for this company
    await supabase
      .from('financial_patterns')
      .update({ active: false })
      .eq('company_id', companyId);

    // Store new patterns
    if (patterns.length > 0) {
      const rows = patterns.map((p) => ({
        company_id: companyId,
        office_id: company.office_id,
        pattern_type: p.type,
        description: p.description,
        confidence: p.confidence,
        data: p.data || {},
        valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        active: true,
      }));

      await supabase.from('financial_patterns').insert(rows);
      logger.info('Financial patterns detected', { companyId, count: patterns.length });
    }

    return patterns;
  } catch (err) {
    logger.error('Pattern detection failed', { companyId, error: err.message });
    return [];
  }
}

async function getActivePatterns(companyId) {
  const { data, error } = await supabase
    .from('financial_patterns')
    .select('*')
    .eq('company_id', companyId)
    .eq('active', true)
    .order('confidence', { ascending: false });

  if (error) throw error;
  return data;
}

async function getCompanyFinancialContext(companyId) {
  const [snapshots, patterns, insights] = await Promise.all([
    getSnapshots(companyId, { days: 30, limit: 30 }),
    getActivePatterns(companyId),
    supabase
      .from('financial_insights')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(10)
      .then((r) => r.data || []),
  ]);

  return {
    latestSnapshot: snapshots[0] || null,
    recentSnapshots: snapshots,
    activePatterns: patterns,
    recentInsights: insights,
  };
}

module.exports = {
  saveSnapshot,
  getSnapshots,
  detectPatterns,
  getActivePatterns,
  getCompanyFinancialContext,
};
