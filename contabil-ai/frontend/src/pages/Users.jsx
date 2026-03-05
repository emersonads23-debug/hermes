import { useState, useEffect } from 'react';
import useCrud from '../hooks/useCrud';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const ROLES = {
  superadmin: 'Super Admin',
  office_admin: 'Admin',
  accountant: 'Contador',
  viewer: 'Cliente',
};

const ROLE_BADGE = {
  superadmin: 'badge-danger',
  office_admin: 'badge-warning',
  accountant: 'badge-info',
  viewer: 'badge-success',
};

export default function Users() {
  const { data: users, loading, create, update, remove } = useCrud('/users');
  const { user: currentUser } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/companies').then((res) => setCompanies(res.data.companies || [])).catch(() => {});
  }, []);

  function openCreate() {
    setForm({ name: '', email: '', password: '', role: 'accountant', phone: '' });
    setModal('create');
  }

  function openEdit(u) {
    setForm({ name: u.name, email: u.email, role: u.role, active: u.active, phone: u.phone || '' });
    setModal(u.id);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal === 'create') {
        await create(form);
      } else {
        const payload = { ...form };
        if (!payload.password) delete payload.password;
        await update(modal, payload);
      }
      setModal(null);
    } catch { /* error handled by useCrud */ }
    setSaving(false);
  }

  const filtered = users.filter((u) =>
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.phone?.includes(search)
  );

  if (loading) return <div className="loading">Carregando...</div>;

  return (
    <div>
      <div className="main-header">
        <h1>Usuarios</h1>
        {['superadmin', 'office_admin'].includes(currentUser.role) && (
          <button className="btn btn-primary" onClick={openCreate}>Novo Usuario</button>
        )}
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <input
          placeholder="Buscar por nome, email ou telefone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%', maxWidth: '400px', padding: '0.6rem 0.8rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.9rem' }}
        />
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Telefone</th>
              <th>Perfil</th>
              <th>Escritorio</th>
              <th>Status</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.name}</strong>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>{u.email}</div>
                </td>
                <td>{u.phone || '-'}</td>
                <td><span className={`badge ${ROLE_BADGE[u.role] || 'badge-info'}`}>{ROLES[u.role] || u.role}</span></td>
                <td>{u.office?.name || '-'}</td>
                <td><span className={`badge ${u.active ? 'badge-success' : 'badge-danger'}`}>{u.active ? 'Ativo' : 'Inativo'}</span></td>
                <td>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(u)}>Editar</button>{' '}
                  <button className="btn btn-danger btn-sm" onClick={() => remove(u.id)}>Desativar</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-light)', padding: '2rem' }}>Nenhum usuario encontrado</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal === 'create' ? 'Novo Usuario' : 'Editar Usuario'} onClose={() => setModal(null)}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Nome</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Telefone (login)</label>
                <input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="5511999999999" />
              </div>
            </div>
            <div className="form-group">
              <label>{modal === 'create' ? 'Senha' : 'Nova Senha (deixe vazio para manter)'}</label>
              <input type="password" value={form.password || ''} onChange={(e) => setForm({ ...form, password: e.target.value })} {...(modal === 'create' ? { required: true, minLength: 8 } : {})} />
            </div>
            <div className="form-group">
              <label>Perfil</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {currentUser.role === 'superadmin' && <option value="superadmin">Super Admin</option>}
                <option value="office_admin">Admin</option>
                <option value="accountant">Contador</option>
                <option value="viewer">Cliente</option>
              </select>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
