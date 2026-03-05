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
  const [contactsModal, setContactsModal] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [contactForm, setContactForm] = useState({ phone: '', name: '' });
  const [contactError, setContactError] = useState('');
  const [contactLoading, setContactLoading] = useState(false);

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

  async function openContacts(company) {
    setContactsModal(company);
    setContactForm({ phone: '', name: '' });
    setContactError('');
    setContactLoading(true);
    try {
      const res = await api.get(`/companies/${company.id}/contacts`);
      setContacts(res.data.contacts || []);
    } catch {
      setContacts([]);
    }
    setContactLoading(false);
  }

  async function handleAddContact(e) {
    e.preventDefault();
    setContactError('');
    try {
      await api.post(`/companies/${contactsModal.id}/contacts`, contactForm);
      setContactForm({ phone: '', name: '' });
      const res = await api.get(`/companies/${contactsModal.id}/contacts`);
      setContacts(res.data.contacts || []);
    } catch (err) {
      setContactError(err.response?.data?.error || 'Erro ao adicionar contato');
    }
  }

  async function handleRemoveContact(contactId) {
    try {
      await api.delete(`/companies/${contactsModal.id}/contacts/${contactId}`);
      setContacts(contacts.filter(c => c.id !== contactId));
    } catch (err) {
      setContactError(err.response?.data?.error || 'Erro ao remover contato');
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
                  <button className="btn btn-primary btn-sm" onClick={() => openContacts(c)}>Contatos</button>{' '}
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

      {contactsModal && (
        <Modal title={`Contatos WhatsApp - ${contactsModal.name}`} onClose={() => setContactsModal(null)}>
          {contactError && <div className="alert alert-danger">{contactError}</div>}

          <form onSubmit={handleAddContact} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label>Telefone (com DDD)</label>
              <input
                value={contactForm.phone}
                onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                placeholder="5511999999999"
                required
              />
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label>Nome</label>
              <input
                value={contactForm.name}
                onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                placeholder="Nome do contato"
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ height: '38px' }}>Adicionar</button>
          </form>

          {contactLoading && <div className="loading">Carregando...</div>}

          {contacts.length === 0 && !contactLoading && (
            <p style={{ color: 'var(--text-light)' }}>Nenhum contato cadastrado. Adicione um numero de WhatsApp acima.</p>
          )}

          {contacts.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Telefone</th>
                  <th>Nome</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id}>
                    <td>{c.phone}</td>
                    <td>{c.name || '-'}</td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => handleRemoveContact(c.id)}>Remover</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}
    </div>
  );
}
