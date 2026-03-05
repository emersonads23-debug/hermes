import { useState } from 'react';
import useCrud from '../hooks/useCrud';
import Modal from '../components/Modal';

export default function Offices() {
  const { data: offices, loading, create, update, remove } = useCrud('/offices');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});

  function openCreate() {
    setForm({ name: '', cnpj: '', email: '', phone: '', adminName: '', adminEmail: '', adminPassword: '' });
    setModal('create');
  }

  function openEdit(office) {
    setForm({ name: office.name, cnpj: office.cnpj, email: office.email, phone: office.phone || '' });
    setModal(office.id);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (modal === 'create') {
      await create(form);
    } else {
      await update(modal, form);
    }
    setModal(null);
  }

  if (loading) return <div className="loading">Carregando...</div>;

  return (
    <div>
      <div className="main-header">
        <h1>Escritorios</h1>
        <button className="btn btn-primary" onClick={openCreate}>Novo Escritorio</button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>CNPJ</th>
              <th>Email</th>
              <th>Status</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {offices.map((o) => (
              <tr key={o.id}>
                <td>{o.name}</td>
                <td>{o.cnpj}</td>
                <td>{o.email}</td>
                <td><span className={`badge ${o.active ? 'badge-success' : 'badge-danger'}`}>{o.active ? 'Ativo' : 'Inativo'}</span></td>
                <td>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(o)}>Editar</button>{' '}
                  <button className="btn btn-danger btn-sm" onClick={() => remove(o.id)}>Desativar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal === 'create' ? 'Novo Escritorio' : 'Editar Escritorio'} onClose={() => setModal(null)}>
          <form onSubmit={handleSubmit}>
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
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Telefone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            {modal === 'create' && (
              <>
                <div className="form-group">
                  <label>Nome do Admin</label>
                  <input value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Email do Admin</label>
                  <input type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Senha do Admin</label>
                  <input type="password" value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} required />
                </div>
              </>
            )}
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
