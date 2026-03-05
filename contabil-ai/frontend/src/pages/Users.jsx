import { useState, useEffect } from 'react';
import useCrud from '../hooks/useCrud';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const ROLES = {
  superadmin: 'Super Admin',
  office_admin: 'Admin Escritorio',
  accountant: 'Contador',
  viewer: 'Visualizador',
};

export default function Users() {
  const { data: users, loading, create, update, remove, fetchAll } = useCrud('/users');
  const { user: currentUser } = useAuth();
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [companiesModal, setCompaniesModal] = useState(null);
  const [availableCompanies, setAvailableCompanies] = useState([]);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState([]);
  const [companiesError, setCompaniesError] = useState('');

  function openCreate() {
    setForm({ name: '', email: '', password: '', role: 'accountant', phone: '' });
    setError('');
    setModal('create');
  }

  function openEdit(u) {
    setForm({ name: u.name, email: u.email, role: u.role, phone: u.phone || '', whatsapp_lid: u.whatsapp_lid || '', active: u.active });
    setError('');
    setModal(u.id);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      if (modal === 'create') {
        await create(form);
      } else {
        const payload = { ...form };
        if (!payload.password) delete payload.password;
        await update(modal, payload);
      }
      setModal(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar usuario');
    }
  }

  async function openCompanies(u) {
    setCompaniesModal(u);
    setCompaniesError('');
    try {
      const res = await api.get('/companies');
      const companies = res.data.companies || [];
      setAvailableCompanies(companies.sort((a, b) => a.name.localeCompare(b.name)));
      const linked = (u.user_companies || []).map(uc => uc.company?.id).filter(Boolean);
      setSelectedCompanyIds(linked);
    } catch {
      setAvailableCompanies([]);
    }
  }

  async function handleSaveCompanies() {
    setCompaniesError('');
    try {
      await api.put(`/users/${companiesModal.id}/companies`, { companyIds: selectedCompanyIds });
      await fetchAll();
      setCompaniesModal(null);
    } catch (err) {
      setCompaniesError(err.response?.data?.error || 'Erro ao vincular empresas');
    }
  }

  function toggleCompany(companyId) {
    setSelectedCompanyIds(prev =>
      prev.includes(companyId)
        ? prev.filter(id => id !== companyId)
        : [...prev, companyId]
    );
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
              <th>WhatsApp</th>
              <th>Perfil</th>
              <th>Empresas</th>
              <th>Status</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.phone || '-'}</td>
                <td>{ROLES[u.role] || u.role}</td>
                <td>{(u.user_companies || []).map(uc => uc.company?.name).filter(Boolean).sort().join(', ') || '-'}</td>
                <td><span className={`badge ${u.active ? 'badge-success' : 'badge-danger'}`}>{u.active ? 'Ativo' : 'Inativo'}</span></td>
                <td>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(u)}>Editar</button>{' '}
                  <button className="btn btn-primary btn-sm" onClick={() => openCompanies(u)}>Empresas</button>{' '}
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
            {error && <div className="alert alert-danger">{error}</div>}
            <div className="form-group">
              <label>Nome</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>WhatsApp (com codigo do pais + DDD)</label>
              <input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="5511999999999" />
            </div>
            {modal !== 'create' && (
              <div className="form-group">
                <label>WhatsApp LID (preenchido automaticamente ou pelo admin)</label>
                <input value={form.whatsapp_lid || ''} onChange={(e) => setForm({ ...form, whatsapp_lid: e.target.value })} placeholder="Identificador LID do Evolution" />
              </div>
            )}
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

      {companiesModal && (
        <Modal title={`Empresas - ${companiesModal.name}`} onClose={() => setCompaniesModal(null)}>
          {companiesError && <div className="alert alert-danger">{companiesError}</div>}
          <p style={{ marginBottom: '1rem', color: 'var(--text-light)' }}>
            Selecione as empresas que este usuario pode consultar pelo WhatsApp:
          </p>
          {availableCompanies.length === 0 && <p>Nenhuma empresa cadastrada.</p>}
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {availableCompanies.map(c => (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={selectedCompanyIds.includes(c.id)}
                  onChange={() => toggleCompany(c.id)}
                />
                {c.name} <span style={{ color: 'var(--text-light)', fontSize: '0.85rem' }}>({c.cnpj})</span>
              </label>
            ))}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setCompaniesModal(null)}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={handleSaveCompanies}>Salvar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
