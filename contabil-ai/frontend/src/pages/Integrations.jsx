import { useState, useEffect } from 'react';
import api from '../services/api';

export default function Integrations() {
  const [integrations, setIntegrations] = useState([]);
  const [omieForm, setOmieForm] = useState({ appKey: '', appSecret: '' });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => { loadIntegrations(); }, []);

  async function loadIntegrations() {
    try {
      const res = await api.get('/integrations');
      setIntegrations(res.data.integrations || []);
    } finally {
      setLoading(false);
    }
  }

  async function connectContaAzul() {
    const res = await api.get('/integrations/contaazul/auth');
    window.open(res.data.url, '_blank');
  }

  async function saveOmie(e) {
    e.preventDefault();
    try {
      await api.post('/integrations/omie', omieForm);
      setMessage('Omie configurado com sucesso!');
      setOmieForm({ appKey: '', appSecret: '' });
      loadIntegrations();
    } catch (err) {
      setMessage('Erro ao configurar Omie');
    }
  }

  async function removeIntegration(provider) {
    await api.delete(`/integrations/${provider}`);
    loadIntegrations();
  }

  if (loading) return <div className="loading">Carregando...</div>;

  const hasContaAzul = integrations.some((i) => i.provider === 'conta_azul');
  const hasOmie = integrations.some((i) => i.provider === 'omie');

  return (
    <div>
      <div className="main-header">
        <h1>Integracoes</h1>
      </div>

      {message && <div className="card" style={{ background: '#dcfce7', marginBottom: '1rem' }}>{message}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div className="card">
          <h3>Conta Azul</h3>
          <p style={{ color: 'var(--text-light)', margin: '0.5rem 0 1rem' }}>
            Conecte sua conta do Conta Azul para consultas financeiras via WhatsApp.
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
            Configure as credenciais do Omie para integrar dados financeiros.
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
    </div>
  );
}
