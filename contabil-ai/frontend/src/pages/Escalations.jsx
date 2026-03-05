import { useState } from 'react';
import useCrud from '../hooks/useCrud';
import api from '../services/api';

const STATUS_MAP = {
  open: { label: 'Aberto', badge: 'badge-danger' },
  in_progress: { label: 'Em Andamento', badge: 'badge-warning' },
  resolved: { label: 'Resolvido', badge: 'badge-success' },
  closed: { label: 'Fechado', badge: 'badge-info' },
};

export default function Escalations() {
  const { data: tasks, loading, fetchAll } = useCrud('/escalations');
  const [filter, setFilter] = useState('');

  async function updateStatus(id, status) {
    await api.put(`/escalations/${id}`, { status });
    fetchAll();
  }

  const filtered = filter ? tasks.filter((t) => t.status === filter) : tasks;

  if (loading) return <div className="loading">Carregando...</div>;

  return (
    <div>
      <div className="main-header">
        <h1>Escalacoes</h1>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ padding: '0.5rem' }}>
          <option value="">Todos</option>
          <option value="open">Abertos</option>
          <option value="in_progress">Em Andamento</option>
          <option value="resolved">Resolvidos</option>
          <option value="closed">Fechados</option>
        </select>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Assunto</th>
              <th>Telefone</th>
              <th>Empresa</th>
              <th>Status</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id}>
                <td>{new Date(t.created_at).toLocaleString('pt-BR')}</td>
                <td>{t.subject}</td>
                <td>{t.user_phone}</td>
                <td>{t.company?.name || '-'}</td>
                <td><span className={`badge ${STATUS_MAP[t.status]?.badge}`}>{STATUS_MAP[t.status]?.label}</span></td>
                <td>
                  {t.status === 'open' && (
                    <button className="btn btn-secondary btn-sm" onClick={() => updateStatus(t.id, 'in_progress')}>Iniciar</button>
                  )}
                  {t.status === 'in_progress' && (
                    <button className="btn btn-primary btn-sm" onClick={() => updateStatus(t.id, 'resolved')}>Resolver</button>
                  )}
                  {t.status !== 'closed' && (
                    <button className="btn btn-danger btn-sm" style={{ marginLeft: '0.25rem' }} onClick={() => updateStatus(t.id, 'closed')}>Fechar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
