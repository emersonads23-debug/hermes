import { useState, useEffect } from 'react';
import api from '../services/api';

export default function Integrations() {
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [integrations, setIntegrations] = useState([]);
  const [omieForm, setOmieForm] = useState({ appKey: '', appSecret: '' });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.get('/companies').then(res => {
      const list = res.data.companies || [];
      setCompanies(list.sort((a, b) => a.name.localeCompare(b.name)));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedCompany) {
      loadIntegrations(selectedCompany);
    } else {
      setIntegrations([]);
    }
  }, [selectedCompany]);

  async function loadIntegrations(companyId) {
    try {
      const res = await api.get(`/integrations?company_id=${companyId}`);
      setIntegrations(res.data.integrations || []);
    } catch {
      setIntegrations([]);
    }
  }

  async function connectContaAzul() {
    const res = await api.get(`/integrations/contaazul/auth?company_id=${selectedCompany}`);
    window.open(res.data.url, '_blank');
  }

  async function saveOmie(e) {
    e.preventDefault();
    setMessage('');
    try {
      await api.post('/integrations/omie', { ...omieForm, company_id: selectedCompany });
      setMessage('Omie configurado com sucesso!');
      setOmieForm({ appKey: '', appSecret: '' });
      loadIntegrations(selectedCompany);
    } catch (err) {
      setMessage(err.response?.data?.error || 'Erro ao configurar Omie');
    }
  }

  async function removeIntegration(provider) {
    await api.delete(`/integrations/${provider}?company_id=${selectedCompany}`);
    loadIntegrations(selectedCompany);
  }

  if (loading) return <div className="loading">Carregando...</div>;

  const hasContaAzul = integrations.some((i) => i.provider === 'conta_azul');
  const hasOmie = integrations.some((i) => i.provider === 'omie');

  return (
    <div>
      <div className="main-header">
        <h1>Integracoes ERP</h1>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Selecione a Empresa</label>
          <select value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)}>
            <option value="">Selecione uma empresa...</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name} ({c.cnpj})</option>)}
          </select>
        </div>
      </div>

      {!selectedCompany && (
        <p style={{ color: 'var(--text-light)', textAlign: 'center', marginTop: '2rem' }}>
          Selecione uma empresa para configurar as integracoes com Conta Azul ou Omie.
        </p>
      )}

      {selectedCompany && (
        <>
          {message && <div className="card" style={{ background: '#dcfce7', marginBottom: '1rem' }}>{message}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="card">
              <h3>Conta Azul</h3>
              <p style={{ color: 'var(--text-light)', margin: '0.5rem 0 1rem' }}>
                Conecte a conta do Conta Azul desta empresa para consultas financeiras via WhatsApp.
              </p>
              {hasContaAzul ? (
                <div>
                  <span className="badge badge-success">Conectado</span>
                  <button className="btn btn-danger btn-sm" style={{ marginLeft: '0.5rem' }} onClick={() => removeIntegration('conta_azul')}>
                    Desconectar
                  </button>
                </div>
              ) : (
                <button className="btn btn-primary" onClick={connectContaAzul}>Conectar Conta Azul</button>
              )}
            </div>

            <div className="card">
              <h3>Omie</h3>
              <p style={{ color: 'var(--text-light)', margin: '0.5rem 0 1rem' }}>
                Configure as credenciais do Omie desta empresa para integrar dados financeiros.
              </p>
              {hasOmie ? (
                <div>
                  <span className="badge badge-success">Configurado</span>
                  <button className="btn btn-danger btn-sm" style={{ marginLeft: '0.5rem' }} onClick={() => removeIntegration('omie')}>
                    Remover
                  </button>
                </div>
              ) : (
                <form onSubmit={saveOmie}>
                  <div className="form-group">
                    <label>App Key</label>
                    <input value={omieForm.appKey} onChange={(e) => setOmieForm({ ...omieForm, appKey: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>App Secret</label>
                    <input type="password" value={omieForm.appSecret} onChange={(e) => setOmieForm({ ...omieForm, appSecret: e.target.value })} required />
                  </div>
                  <button type="submit" className="btn btn-primary">Salvar Omie</button>
                </form>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
