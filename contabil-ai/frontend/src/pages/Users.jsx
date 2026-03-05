import { useState } from 'react';
import useCrud from '../hooks/useCrud';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';

const ROLES = {
  superadmin: 'Super Admin',
  office_admin: 'Admin Escritorio',
  accountant: 'Contador',
  viewer: 'Visualizador',
};

export default function Users() {
  const { data: users, loading, create, update, remove } = useCrud('/users');
  const { user: currentUser } = useAuth();
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});

  function openCreate() {
    setForm({ name: '', email: '', password: '', role: 'accountant' });
    setModal('create');
  }

  function openEdit(u) {
    setForm({ name: u.name, email: u.email, role: u.role, active: u.active });
    setModal(u.id);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (modal === 'create') {
      await create(form);
    } else {
      const payload = { ...form };
      if (!payload.password) delete payload.password;
      await update(modal, payload);
    }
    setModal(null);
  }

  if (loading) return <div className="loading">Carregando...</div>;

  return (
    <div>
      <div className="main-header">
        <h1>Usuarios</h1>
        {['superadmin', 'office_admin'].includes(currentUser.role) && (
          <button className="btn btn-primary" onClick={openCreate}>Novo Usuario</button>
        )}
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Email</th>
              <th>Perfil</th>
              <th>Escritorio</th>
              <th>Status</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{ROLES[u.role] || u.role}</td>
                <td>{u.office?.name || '-'}</td>
                <td><span className={`badge ${u.active ? 'badge-success' : 'badge-danger'}`}>{u.active ? 'Ativo' : 'Inativo'}</span></td>
                <td>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(u)}>Editar</button>{' '}
                  <button className="btn btn-danger btn-sm" onClick={() => remove(u.id)}>Desativar</button>
                </td>
              </tr>
            ))}
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
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>{modal === 'create' ? 'Senha' : 'Nova Senha (deixe vazio para manter)'}</label>
              <input type="password" value={form.password || ''} onChange={(e) => setForm({ ...form, password: e.target.value })} {...(modal === 'create' ? { required: true } : {})} />
            </div>
            <div className="form-group">
              <label>Perfil</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {currentUser.role === 'superadmin' && <option value="superadmin">Super Admin</option>}
                <option value="office_admin">Admin Escritorio</option>
                <option value="accountant">Contador</option>
                <option value="viewer">Visualizador</option>
              </select>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">Salvar</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
