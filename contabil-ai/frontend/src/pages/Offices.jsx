import { useState } from 'react';
import useCrud from '../hooks/useCrud';
import Modal from '../components/Modal';

const PLANS = { basic: 'Basic', professional: 'Professional', enterprise: 'Enterprise' };

export default function Offices() {
  const { data: offices, loading, create, update, remove } = useCrud('/offices');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setForm({
      name: '', cnpj: '', email: '', phone: '',
      plan: 'basic', max_companies: 10,
      adminName: '', adminEmail: '', adminPassword: '', adminPhone: '',
    });
    setModal('create');
  }

  function openEdit(office) {
    setForm({
      name: office.name, cnpj: office.cnpj, email: office.email,
      phone: office.phone || '', plan: office.plan || 'basic',
      max_companies: office.max_companies || 10,
    });
    setModal(office.id);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal === 'create') {
        await create({ ...form, max_companies: parseInt(form.max_companies, 10) || 10 });
      } else {
        const { adminName, adminEmail, adminPassword, adminPhone, ...updateData } = form;
        await update(modal, { ...updateData, max_companies: parseInt(updateData.max_companies, 10) || 10 });
      }
      setModal(null);
    } catch { /* error handled by useCrud */ }
    setSaving(false);
  }

  const filtered = offices.filter((o) =>
    o.name?.toLowerCase().includes(search.toLowerCase()) ||
    o.cnpj?.includes(search)
  );

  if (loading) return <div className="loading">Carregando...</div>;

  return (
    <div>
      <div className="main-header">
        <h1>Escritorios (BPOs)</h1>
        <button className="btn btn-primary" onClick={openCreate}>Novo Escritorio</button>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <input
          className="search-input"
          placeholder="Buscar por nome ou CNPJ..."
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
              <th>Plano</th>
              <th>Max Empresas</th>
              <th>Criado em</th>
              <th>Status</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id}>
                <td><strong>{o.name}</strong></td>
                <td><span className="badge badge-info">{PLANS[o.plan] || o.plan || 'Basic'}</span></td>
                <td>{o.max_companies || '-'}</td>
                <td>{o.created_at ? new Date(o.created_at).toLocaleDateString('pt-BR') : '-'}</td>
                <td><span className={`badge ${o.active !== false ? 'badge-success' : 'badge-danger'}`}>{o.active !== false ? 'Ativo' : 'Inativo'}</span></td>
                <td>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(o)}>Editar</button>{' '}
                  <button className="btn btn-danger btn-sm" onClick={() => remove(o.id)}>Desativar</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-light)', padding: '2rem' }}>Nenhum escritorio encontrado</td></tr>
            )}
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
              <label>Logo URL</label>
              <input value={form.logo || ''} onChange={(e) => setForm({ ...form, logo: e.target.value })} placeholder="https://..." />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div className="form-group">
                <label>Plano</label>
                <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
                  <option value="basic">Basic</option>
                  <option value="professional">Professional</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div className="form-group">
                <label>Max Empresas</label>
                <input type="number" min="1" value={form.max_companies} onChange={(e) => setForm({ ...form, max_companies: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label>CNPJ</label>
              <input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} required />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Telefone</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>

            {modal === 'create' && (
              <>
                <hr style={{ margin: '1rem 0', border: 'none', borderTop: '1px solid var(--border)' }} />
                <p style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--primary)' }}>Administrador do Escritorio</p>
                <div className="form-group">
                  <label>Nome do Admin</label>
                  <input value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} required />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div className="form-group">
                    <label>Email do Admin</label>
                    <input type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>Telefone do Admin</label>
                    <input value={form.adminPhone} onChange={(e) => setForm({ ...form, adminPhone: e.target.value })} placeholder="5511999999999" />
                  </div>
                </div>
                <div className="form-group">
                  <label>Senha do Admin</label>
                  <input type="password" value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} required minLength={8} />
                </div>
              </>
            )}

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
