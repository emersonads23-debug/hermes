import { useState, useEffect } from 'react';
import api from '../services/api';

const ERP_LABELS = { conta_azul: 'Conta Azul', omie: 'Omie' };

export default function ErpIntegrations() {
  const [integrations, setIntegrations] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(null);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const res = await api.get('/admin/erp-integrations');
      setIntegrations(res.data.integrations || []);
      setCompanies(res.data.companies || []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function testConnection(provider, officeId) {
    setTesting(`${provider}-${officeId}`);
    setTestResult(null);
    try {
      const res = await api.post('/admin/erp/test', { provider, office_id: officeId });
      setTestResult({ key: `${provider}-${officeId}`, ...res.data });
    } catch (err) {
      setTestResult({ key: `${provider}-${officeId}`, success: false, error: err.response?.data?.error || err.message });
    }
    setTesting(null);
  }

  async function refreshToken(provider) {
    try {
      if (provider === 'conta_azul') {
        const res = await api.get('/integrations/contaazul/auth');
        window.open(res.data.url, '_blank');
      }
    } catch { /* ignore */ }
  }

  if (loading) return <div className="loading">Carregando...</div>;

  return (
    <div>
      <div className="main-header">
        <h1>Integracoes ERP</h1>
      </div>

      <h3 style={{ marginBottom: '1rem' }}>Tokens de Integracao</h3>
      <div className="table-container" style={{ marginBottom: '2rem' }}>
        <table>
          <thead>
            <tr>
              <th>Escritorio</th>
              <th>ERP</th>
              <th>Status Token</th>
              <th>Ultima Atualizacao</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {integrations.map((i) => {
              const isExpired = i.provider !== 'omie' && new Date(i.expires_at) < new Date();
              const key = `${i.provider}-${i.office_id || ''}`;
              const result = testResult?.key === key ? testResult : null;

              return (
                <tr key={`${i.provider}-${i.office_id}`}>
                  <td>{i.office?.name || '-'}</td>
                  <td><span className="badge badge-info">{ERP_LABELS[i.provider] || i.provider}</span></td>
                  <td>
                    <span className={`badge ${isExpired ? 'badge-danger' : 'badge-success'}`}>
                      {isExpired ? 'Expirado' : 'Ativo'}
                    </span>
                    {result && (
                      <span className={`badge ${result.success ? 'badge-success' : 'badge-danger'}`} style={{ marginLeft: '0.5rem' }}>
                        {result.success ? 'Conexao OK' : 'Falha'}
                      </span>
                    )}
                  </td>
                  <td>{i.updated_at ? new Date(i.updated_at).toLocaleString('pt-BR') : '-'}</td>
                  <td style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => testConnection(i.provider, i.office_id)}
                      disabled={testing === key}
                    >
                      {testing === key ? 'Testando...' : 'Testar'}
                    </button>
                    {i.provider === 'conta_azul' && (
                      <button className="btn btn-secondary btn-sm" onClick={() => refreshToken(i.provider)}>
                        Renovar Token
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {integrations.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-light)', padding: '2rem' }}>Nenhuma integracao configurada</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h3 style={{ marginBottom: '1rem' }}>Empresas com ERP Configurado</h3>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Escritorio</th>
              <th>ERP</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.office?.name || '-'}</td>
                <td><span className="badge badge-info">{ERP_LABELS[c.erp_type] || c.erp_type}</span></td>
              </tr>
            ))}
            {companies.length === 0 && (
              <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-light)', padding: '2rem' }}>Nenhuma empresa com ERP configurado</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
