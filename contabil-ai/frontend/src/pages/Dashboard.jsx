import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ offices: 0, companies: 0, users: 0, escalations: 0 });

  useEffect(() => {
    async function loadStats() {
      try {
        const [companies, users, escalations] = await Promise.all([
          api.get('/companies'),
          api.get('/users'),
          api.get('/escalations?status=open'),
        ]);
        setStats({
          companies: companies.data.companies?.length || 0,
          users: users.data.users?.length || 0,
          escalations: escalations.data.tasks?.length || 0,
        });
      } catch {
        // Stats will remain at 0
      }
    }
    loadStats();
  }, []);

  return (
    <div>
      <div className="main-header">
        <h1>Dashboard</h1>
        <span>Ola, {user.name}</span>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="label">Empresas</div>
          <div className="value">{stats.companies}</div>
        </div>
        <div className="stat-card">
          <div className="label">Usuarios</div>
          <div className="value">{stats.users}</div>
        </div>
        <div className="stat-card">
          <div className="label">Escalacoes Abertas</div>
          <div className="value" style={{ color: stats.escalations > 0 ? 'var(--danger)' : 'inherit' }}>
            {stats.escalations}
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Bem-vindo ao ContabilAI</h3>
        <p style={{ marginTop: '0.5rem', color: 'var(--text-light)' }}>
          Gerencie seus escritorios, empresas e acompanhe as interacoes do assistente financeiro via WhatsApp.
        </p>
      </div>
    </div>
  );
}
