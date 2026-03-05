import { useState, useEffect } from 'react';
import api from '../services/api';

const STATUS_LABELS = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
  completed: 'Concluido',
  cancelled: 'Cancelado',
};

const PRIORITY_COLORS = {
  urgent: '#dc2626',
  high: '#f59e0b',
  medium: '#3b82f6',
  low: '#6b7280',
};

const TYPE_LABELS = {
  document_review: 'Revisao de Documento',
  escalation: 'Escalacao',
  data_validation: 'Validacao de Dados',
  client_followup: 'Acompanhamento',
  alert_review: 'Revisao de Alerta',
  manual_entry: 'Entrada Manual',
  other: 'Outro',
};

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState({});
  const [filter, setFilter] = useState('pending');
  const [total, setTotal] = useState(0);

  useEffect(() => {
    async function fetchTasks() {
      try {
        const params = filter ? `?status=${filter}` : '';
        const res = await api.get(`/tasks${params}`);
        setTasks(res.data.tasks || []);
        setTotal(res.data.total || 0);
      } catch {
        setTasks([]);
      }
    }
    fetchTasks();
    api.get('/tasks/stats').then((res) => setStats(res.data)).catch(() => {});
  }, [filter]);

  async function updateStatus(taskId, status) {
    try {
      await api.put(`/tasks/${taskId}`, { status });
      const params = filter ? `?status=${filter}` : '';
      const res = await api.get(`/tasks${params}`);
      setTasks(res.data.tasks || []);
      setTotal(res.data.total || 0);
      api.get('/tasks/stats').then((r) => setStats(r.data)).catch(() => {});
    } catch {
      // ignore
    }
  }

  return (
    <div>
      <div className="main-header">
        <h1>Tarefas</h1>
        <span style={{ color: 'var(--text-light)' }}>{total} tarefa(s)</span>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="label">Pendentes</div>
          <div className="value">{stats.pending || 0}</div>
        </div>
        <div className="stat-card">
          <div className="label">Em andamento</div>
          <div className="value">{stats.in_progress || 0}</div>
        </div>
        <div className="stat-card">
          <div className="label">Urgentes</div>
          <div className="value" style={{ color: 'var(--danger)' }}>{stats.urgent || 0}</div>
        </div>
        <div className="stat-card">
          <div className="label">Concluidas</div>
          <div className="value">{stats.completed || 0}</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {['pending', 'in_progress', 'completed', ''].map((s) => (
          <button
            key={s}
            className={`btn ${filter === s ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter(s)}
          >
            {s ? STATUS_LABELS[s] : 'Todas'}
          </button>
        ))}
      </div>

      {/* Task List */}
      <div className="card">
        {tasks.length === 0 && (
          <p style={{ color: 'var(--text-light)', textAlign: 'center' }}>Nenhuma tarefa encontrada.</p>
        )}
        {tasks.map((task) => (
          <div
            key={task.id}
            style={{
              padding: '1rem',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: PRIORITY_COLORS[task.priority] || '#6b7280',
                  }}
                />
                <strong>{task.title}</strong>
                <span
                  style={{
                    fontSize: '0.75rem',
                    padding: '0.1rem 0.5rem',
                    borderRadius: '12px',
                    background: '#f3f4f6',
                    color: '#374151',
                  }}
                >
                  {TYPE_LABELS[task.task_type] || task.task_type}
                </span>
              </div>
              {task.message && (
                <p style={{ margin: '0.25rem 0 0', color: 'var(--text-light)', fontSize: '0.875rem' }}>
                  {task.message}
                </p>
              )}
              <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: '#9ca3af' }}>
                {task.company?.name && <span>{task.company.name} | </span>}
                {task.assignee?.name && <span>Responsavel: {task.assignee.name} | </span>}
                {new Date(task.created_at).toLocaleDateString('pt-BR')}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
              {task.status === 'pending' && (
                <button className="btn btn-primary" onClick={() => updateStatus(task.id, 'in_progress')}>
                  Iniciar
                </button>
              )}
              {task.status === 'in_progress' && (
                <button className="btn btn-primary" onClick={() => updateStatus(task.id, 'completed')}>
                  Concluir
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
