import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const STAT_CARDS = [
  { key: 'offices', label: 'Escritorios', color: '#2563eb' },
  { key: 'companies', label: 'Empresas', color: '#7c3aed' },
  { key: 'users', label: 'Usuarios', color: '#0891b2' },
  { key: 'documents_processed', label: 'Documentos Processados', color: '#059669' },
  { key: 'messages_processed', label: 'Mensagens Processadas', color: '#d97706' },
  { key: 'tasks_open', label: 'Tarefas Abertas', color: '#dc2626' },
];

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/stats')
      .then((res) => setStats(res.data.stats || {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="main-header">
        <h1>Dashboard</h1>
        <span style={{ color: 'var(--text-light)' }}>Ola, {user.name}</span>
      </div>

      <div className="stats-grid">
        {STAT_CARDS.map((card) => (
          <div className="stat-card" key={card.key}>
            <div className="label">{card.label}</div>
            <div className="value" style={{ color: card.color }}>
              {loading ? '...' : (stats[card.key] ?? 0).toLocaleString('pt-BR')}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Onboarding Rapido</h3>
        <p style={{ marginTop: '0.5rem', color: 'var(--text-light)', marginBottom: '1rem' }}>
          Configure novos escritorios BPO e suas empresas clientes em minutos.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <a href="/offices" className="btn btn-primary">Novo Escritorio</a>
          <a href="/companies" className="btn btn-secondary">Nova Empresa</a>
          <a href="/users" className="btn btn-secondary">Novo Usuario</a>
          <a href="/whatsapp" className="btn btn-secondary">WhatsApp</a>
          <a href="/erp" className="btn btn-secondary">Integracoes ERP</a>
        </div>
      </div>
    </div>
  );
}
