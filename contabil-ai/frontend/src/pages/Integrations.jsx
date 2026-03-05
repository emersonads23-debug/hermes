import { useState, useEffect } from 'react';
import api from '../services/api';

export default function Integrations() {
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [integrations, setIntegrations] = useState([]);
  const [contaAzulForm, setContaAzulForm] = useState({
    client_id: '', client_secret: '', access_token: '', refresh_token: '',
  });
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

  async function saveContaAzul(e) {
    e.preventDefault();
    setMessage('');
    try {
      await api.post('/integrations/contaazul', {
        ...contaAzulForm,
        company_id: selectedCompany,
      });
      setMessage('Conta Azul configurada com sucesso!');
      setContaAzulForm({ client_id: '', client_secret: '', access_token: '', refresh_token: '' });
      loadIntegrations(selectedCompany);
    } catch (err) {
      setMessage(err.response?.data?.error || 'Erro ao configurar Conta Azul');
    }
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
    setMessage('');
    loadIntegrations(selectedCompany);
  }

  if (loading) return <div className="loading">Carregando...</div>;

  const hasContaAzul = integrations.some((i) => i.provider === 'conta_azul');
  const contaAzulInfo = integrations.find((i) => i.provider === 'conta_azul');
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
            {/* Conta Azul */}
            <div className="card">
              <h3>Conta Azul</h3>
              <p style={{ color: 'var(--text-light)', margin: '0.5rem 0 1rem' }}>
                Cadastre os tokens da Conta Azul desta empresa para consultas financeiras via WhatsApp.
              </p>
              {hasContaAzul ? (
                <div>
                  <span className="badge badge-success" style={{ display: 'inline-block', padding: '0.25rem 0.75rem', borderRadius: '12px', background: '#dcfce7', color: '#166534', fontSize: '0.875rem' }}>
                    {contaAzulInfo?.status === 'expired' ? 'Token Expirado' : 'Conectado'}
                  </span>
                  {contaAzulInfo?.status === 'expired' && (
                    <span style={{ color: '#991b1b', fontSize: '0.75rem', marginLeft: '0.5rem' }}>
                      Atualize os tokens
                    </span>
                  )}
                  <button className="btn btn-danger btn-sm" style={{ marginLeft: '0.5rem' }} onClick={() => removeIntegration('conta_azul')}>
                    Remover
                  </button>
                </div>
              ) : (
                <form onSubmit={saveContaAzul}>
                  <div className="form-group">
                    <label>Client ID</label>
                    <input
                      value={contaAzulForm.client_id}
                      onChange={(e) => setContaAzulForm({ ...contaAzulForm, client_id: e.target.value })}
                      placeholder="Ex: 4n5uf6d05k9n4oap9hsjc2901p"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Client Secret</label>
                    <input
                      type="password"
                      value={contaAzulForm.client_secret}
                      onChange={(e) => setContaAzulForm({ ...contaAzulForm, client_secret: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Access Token</label>
                    <textarea
                      value={contaAzulForm.access_token}
                      onChange={(e) => setContaAzulForm({ ...contaAzulForm, access_token: e.target.value })}
                      placeholder="Cole o Access Token aqui"
                      rows={3}
                      style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '0.8rem' }}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Refresh Token</label>
                    <textarea
                      value={contaAzulForm.refresh_token}
                      onChange={(e) => setContaAzulForm({ ...contaAzulForm, refresh_token: e.target.value })}
                      placeholder="Cole o Refresh Token aqui"
                      rows={3}
                      style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '0.8rem' }}
                      required
                    />
                  </div>
                  <button type="submit" className="btn btn-primary">Salvar Conta Azul</button>
                </form>
              )}
            </div>

            {/* Omie */}
            <div className="card">
              <h3>Omie</h3>
              <p style={{ color: 'var(--text-light)', margin: '0.5rem 0 1rem' }}>
                Configure as credenciais do Omie desta empresa para integrar dados financeiros.
              </p>
              {hasOmie ? (
                <div>
                  <span className="badge badge-success" style={{ display: 'inline-block', padding: '0.25rem 0.75rem', borderRadius: '12px', background: '#dcfce7', color: '#166534', fontSize: '0.875rem' }}>
                    Configurado
                  </span>
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
