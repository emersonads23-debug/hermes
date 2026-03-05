import { useState, useEffect } from 'react';
import useCrud from '../hooks/useCrud';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export default function Companies() {
  const { data: companies, loading, create, update, remove } = useCrud('/companies');
  const { user } = useAuth();
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [offices, setOffices] = useState([]);

  useEffect(() => {
    if (user?.role === 'superadmin') {
      api.get('/offices').then(res => {
        const key = Object.keys(res.data).find(k => Array.isArray(res.data[k]));
        setOffices(key ? res.data[key] : []);
      }).catch(() => {});
    }
  }, [user]);

  function openCreate() {
    setForm({ name: '', cnpj: '', email: '', phone: '', office_id: '' });
    setError('');
    setModal('create');
  }

  function openEdit(company) {
    setForm({ name: company.name, cnpj: company.cnpj, email: company.email || '', phone: company.phone || '' });
    setError('');
    setModal(company.id);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      if (modal === 'create') {
        await create(form);
      } else {
        await update(modal, form);
      }
      setModal(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar empresa');
    }
  }

  if (loading) return <div className="loading">Carregando...</div>;

  return (
    <div>
      <div className="main-header">
        <h1>Empresas</h1>
        <button className="btn btn-primary" onClick={openCreate}>Nova Empresa</button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>CNPJ</th>
              <th>Escritorio</th>
              <th>Status</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.cnpj}</td>
                <td>{c.office?.name || '-'}</td>
                <td><span className={`badge ${c.active ? 'badge-success' : 'badge-danger'}`}>{c.active ? 'Ativa' : 'Inativa'}</span></td>
                <td>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(c)}>Editar</button>{' '}
                  <button className="btn btn-danger btn-sm" onClick={() => remove(c.id)}>Desativar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal === 'create' ? 'Nova Empresa' : 'Editar Empresa'} onClose={() => setModal(null)}>
          <form onSubmit={handleSubmit}>
            {error && <div className="alert alert-danger">{error}</div>}
            {user?.role === 'superadmin' && modal === 'create' && (
              <div className="form-group">
                <label>Escritorio</label>
                <select value={form.office_id} onChange={(e) => setForm({ ...form, office_id: e.target.value })} required>
                  <option value="">Selecione...</option>
                  {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            )}
            <div className="form-group">
              <label>Nome</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>CNPJ</label>
              <input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Telefone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
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
