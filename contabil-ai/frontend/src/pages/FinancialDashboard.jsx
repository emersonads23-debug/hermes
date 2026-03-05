import { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import api from '../services/api';

const CHART_COLORS = {
  revenue: '#10b981',
  expenses: '#ef4444',
  cash: '#3b82f6',
  receivable: '#f59e0b',
  payable: '#8b5cf6',
};

function formatBRL(value) {
  return `R$ ${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

export default function FinancialDashboard() {
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [snapshots, setSnapshots] = useState([]);
  const [insights, setInsights] = useState([]);
  const [patterns, setPatterns] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/companies').then((res) => {
      const list = res.data.companies || [];
      setCompanies(list);
      if (list.length > 0) setSelectedCompany(list[0].id);
    }).catch(() => {});

    api.get('/financial/alerts?unread_only=true').then((res) => {
      setAlerts(res.data.alerts || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedCompany) return;
    setLoading(true);

    Promise.all([
      api.get(`/financial/snapshots?company_id=${selectedCompany}&days=90`),
      api.get(`/financial/insights?company_id=${selectedCompany}&limit=10`),
      api.get(`/financial/patterns?company_id=${selectedCompany}`),
    ]).then(([snapRes, insightRes, patternRes]) => {
      setSnapshots((snapRes.data.snapshots || []).reverse());
      setInsights(insightRes.data.insights || []);
      setPatterns(patternRes.data.patterns || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [selectedCompany]);

  const latestSnapshot = snapshots[snapshots.length - 1];

  const chartData = snapshots.map((s) => ({
    date: new Date(s.snapshot_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    receita: Number(s.total_revenue),
    despesas: Number(s.total_expenses),
    caixa: Number(s.cash_balance),
    receber: Number(s.accounts_receivable),
    pagar: Number(s.accounts_payable),
  }));

  function handleMarkRead(alertId) {
    api.post(`/financial/alerts/${alertId}/read`).then(() => {
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    }).catch(() => {});
  }

  return (
    <div>
      <div className="main-header">
        <h1>Painel Financeiro</h1>
        <select
          value={selectedCompany}
          onChange={(e) => setSelectedCompany(e.target.value)}
          style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Alerts Banner */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          {alerts.slice(0, 3).map((alert) => (
            <div
              key={alert.id}
              className="card"
              style={{
                borderLeft: `4px solid ${alert.severity === 'critical' ? 'var(--danger)' : '#f59e0b'}`,
                marginBottom: '0.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <strong>{alert.title}</strong>
                <p style={{ margin: '0.25rem 0 0', color: 'var(--text-light)', fontSize: '0.875rem' }}>
                  {alert.message}
                </p>
              </div>
              <button
                className="btn btn-secondary"
                style={{ flexShrink: 0, marginLeft: '1rem' }}
                onClick={() => handleMarkRead(alert.id)}
              >
                OK
              </button>
            </div>
          ))}
        </div>
      )}

      {/* KPI Cards */}
      {latestSnapshot && (
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          <div className="stat-card">
            <div className="label">Receita</div>
            <div className="value" style={{ color: CHART_COLORS.revenue }}>{formatBRL(latestSnapshot.total_revenue)}</div>
          </div>
          <div className="stat-card">
            <div className="label">Despesas</div>
            <div className="value" style={{ color: CHART_COLORS.expenses }}>{formatBRL(latestSnapshot.total_expenses)}</div>
          </div>
          <div className="stat-card">
            <div className="label">Caixa</div>
            <div className="value" style={{ color: CHART_COLORS.cash }}>{formatBRL(latestSnapshot.cash_balance)}</div>
          </div>
          <div className="stat-card">
            <div className="label">A Receber</div>
            <div className="value" style={{ color: CHART_COLORS.receivable }}>{formatBRL(latestSnapshot.accounts_receivable)}</div>
          </div>
          <div className="stat-card">
            <div className="label">A Pagar</div>
            <div className="value" style={{ color: CHART_COLORS.payable }}>{formatBRL(latestSnapshot.accounts_payable)}</div>
          </div>
        </div>
      )}

      {loading && <p style={{ textAlign: 'center', color: 'var(--text-light)' }}>Carregando...</p>}

      {/* Cash Flow Chart */}
      {chartData.length > 0 && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h3>Fluxo de Caixa</h3>
          <div style={{ width: '100%', height: 300, marginTop: '1rem' }}>
            <ResponsiveContainer>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => formatBRL(v)} />
                <Legend />
                <Area type="monotone" dataKey="caixa" name="Caixa" stroke={CHART_COLORS.cash} fill={CHART_COLORS.cash} fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Revenue vs Expenses */}
      {chartData.length > 0 && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h3>Receita vs Despesas</h3>
          <div style={{ width: '100%', height: 300, marginTop: '1rem' }}>
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => formatBRL(v)} />
                <Legend />
                <Bar dataKey="receita" name="Receita" fill={CHART_COLORS.revenue} radius={[4, 4, 0, 0]} />
                <Bar dataKey="despesas" name="Despesas" fill={CHART_COLORS.expenses} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Accounts Receivable / Payable Timeline */}
      {chartData.length > 0 && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h3>Contas a Receber vs Contas a Pagar</h3>
          <div style={{ width: '100%', height: 300, marginTop: '1rem' }}>
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => formatBRL(v)} />
                <Legend />
                <Line type="monotone" dataKey="receber" name="A Receber" stroke={CHART_COLORS.receivable} strokeWidth={2} />
                <Line type="monotone" dataKey="pagar" name="A Pagar" stroke={CHART_COLORS.payable} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Insights */}
      {insights.length > 0 && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h3>Insights da IA</h3>
          <div style={{ marginTop: '0.75rem' }}>
            {insights.map((insight) => (
              <div
                key={insight.id}
                style={{
                  padding: '0.75rem',
                  marginBottom: '0.5rem',
                  borderRadius: '6px',
                  background: insight.severity === 'critical' ? '#fef2f2' : insight.severity === 'warning' ? '#fffbeb' : '#f0fdf4',
                  borderLeft: `3px solid ${insight.severity === 'critical' ? '#dc2626' : insight.severity === 'warning' ? '#f59e0b' : '#10b981'}`,
                }}
              >
                <strong>{insight.title}</strong>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#374151' }}>
                  {insight.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Patterns */}
      {patterns.length > 0 && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h3>Padroes Detectados</h3>
          <div style={{ marginTop: '0.75rem' }}>
            {patterns.map((pattern) => (
              <div key={pattern.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong style={{ textTransform: 'capitalize' }}>{pattern.pattern_type.replace(/_/g, ' ')}</strong>
                  <span style={{ color: 'var(--text-light)', fontSize: '0.875rem' }}>
                    {pattern.confidence}% confianca
                  </span>
                </div>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--text-light)' }}>
                  {pattern.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
