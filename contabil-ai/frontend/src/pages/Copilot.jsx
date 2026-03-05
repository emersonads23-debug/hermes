import { useState, useEffect } from 'react';
import api from '../services/api';

const SEVERITY_STYLES = {
  critical: { bg: '#fef2f2', border: '#dc2626', text: '#991b1b' },
  warning: { bg: '#fffbeb', border: '#f59e0b', text: '#92400e' },
  info: { bg: '#f0fdf4', border: '#10b981', text: '#065f46' },
};

function formatDate(d) {
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function Copilot() {
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [sessions, setSessions] = useState([]);
  const [actions, setActions] = useState([]);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [asking, setAsking] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/companies').then((res) => {
      const list = res.data.companies || [];
      setCompanies(list);
      if (list.length > 0) setSelectedCompany(list[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedCompany) return;
    setLoading(true);
    Promise.all([
      api.get(`/copilot/sessions?company_id=${selectedCompany}&limit=10`),
      api.get('/copilot/actions?limit=20'),
    ]).then(([sessRes, actRes]) => {
      setSessions(sessRes.data.sessions || []);
      setActions(actRes.data.actions || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [selectedCompany]);

  function handleTrigger() {
    if (!selectedCompany || triggering) return;
    setTriggering(true);
    api.post('/copilot/evaluate', { company_id: selectedCompany })
      .then(() => {
        setTimeout(() => {
          api.get(`/copilot/sessions?company_id=${selectedCompany}&limit=10`)
            .then((res) => setSessions(res.data.sessions || []));
        }, 3000);
      })
      .catch(() => {})
      .finally(() => setTriggering(false));
  }

  function handleAsk(e) {
    e.preventDefault();
    if (!question.trim() || !selectedCompany || asking) return;
    setAsking(true);
    setAnswer('');
    api.post('/copilot/ask', { company_id: selectedCompany, question })
      .then((res) => setAnswer(res.data.answer))
      .catch(() => setAnswer('Erro ao consultar o copilot.'))
      .finally(() => setAsking(false));
  }

  const riskActions = actions.filter((a) => a.action_type === 'risk_detected');
  const recommendations = actions.filter((a) => a.action_type === 'recommendation');
  const alertActions = actions.filter((a) => ['alert_sent', 'task_created'].includes(a.action_type));

  return (
    <div>
      <div className="main-header">
        <h1>Copilot Financeiro</h1>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <select
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value)}
            style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)' }}
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={handleTrigger} disabled={triggering}>
            {triggering ? 'Analisando...' : 'Executar Copilot'}
          </button>
        </div>
      </div>

      {/* Ask Copilot */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3>Pergunte ao Copilot</h3>
        <form onSubmit={handleAsk} style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ex: como esta meu fluxo de caixa?"
            style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border)' }}
          />
          <button className="btn btn-primary" type="submit" disabled={asking}>
            {asking ? 'Pensando...' : 'Perguntar'}
          </button>
        </form>
        {answer && (
          <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '6px', whiteSpace: 'pre-wrap' }}>
            {answer}
          </div>
        )}
      </div>

      {loading && <p style={{ textAlign: 'center', color: 'var(--text-light)' }}>Carregando...</p>}

      {/* Risk Alerts */}
      {riskActions.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3>Riscos Detectados</h3>
          <div style={{ marginTop: '0.75rem' }}>
            {riskActions.map((a) => {
              const style = SEVERITY_STYLES[a.severity] || SEVERITY_STYLES.info;
              return (
                <div key={a.id} style={{ padding: '0.75rem', marginBottom: '0.5rem', borderRadius: '6px', background: style.bg, borderLeft: `3px solid ${style.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ color: style.text, textTransform: 'capitalize' }}>{(a.risk_type || '').replace(/_/g, ' ')}</strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>{formatDate(a.created_at)}</span>
                  </div>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem' }}>{a.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3>Recomendacoes</h3>
          <div style={{ marginTop: '0.75rem' }}>
            {recommendations.map((a, i) => (
              <div key={a.id} style={{ padding: '0.5rem 0', borderBottom: i < recommendations.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
                  <span style={{ background: '#e0e7ff', color: '#3730a3', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', flexShrink: 0 }}>
                    {i + 1}
                  </span>
                  <p style={{ margin: 0, fontSize: '0.875rem' }}>{a.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions Log */}
      {alertActions.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3>Acoes Executadas</h3>
          <div style={{ marginTop: '0.75rem' }}>
            {alertActions.map((a) => (
              <div key={a.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.875rem' }}>
                  <strong>{a.action_type === 'alert_sent' ? 'Alerta enviado' : 'Tarefa criada'}:</strong> {a.description}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-light)', flexShrink: 0, marginLeft: '1rem' }}>{formatDate(a.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sessions History */}
      {sessions.length > 0 && (
        <div className="card">
          <h3>Historico de Sessoes</h3>
          <table className="data-table" style={{ marginTop: '0.75rem' }}>
            <thead>
              <tr>
                <th>Data</th>
                <th>Empresa</th>
                <th>Tipo</th>
                <th>Riscos</th>
                <th>Acoes</th>
                <th>Duracao</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td>{formatDate(s.created_at)}</td>
                  <td>{s.company?.name || '-'}</td>
                  <td style={{ textTransform: 'capitalize' }}>{s.trigger_type}</td>
                  <td>{s.risks_detected || 0}</td>
                  <td>{s.actions_taken || 0}</td>
                  <td>{s.duration_ms ? `${(s.duration_ms / 1000).toFixed(1)}s` : '-'}</td>
                  <td>
                    <span style={{
                      padding: '0.2rem 0.5rem',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      background: s.status === 'completed' ? '#dcfce7' : s.status === 'failed' ? '#fee2e2' : '#fef3c7',
                      color: s.status === 'completed' ? '#166534' : s.status === 'failed' ? '#991b1b' : '#92400e',
                    }}>
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
