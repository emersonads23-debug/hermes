import { useState } from 'react';
import useCrud from '../hooks/useCrud';
import Modal from '../components/Modal';

export default function Offices() {
  const { data: offices, loading, create, update, remove } = useCrud('/offices');
  const [modal, setModal] = useState(null); // null | 'create' | office.id (edit) | { delete: office }
  const [form, setForm] = useState({});
  const [activeTab, setActiveTab] = useState('dados');

  function openCreate() {
    setForm({
      name: '', cnpj: '', email: '', phone: '',
      adminName: '', adminEmail: '', adminPassword: '',
      evolution_instance_url: '', evolution_api_key: '', evolution_instance_name: '', bot_name: '',
    });
    setActiveTab('dados');
    setModal('create');
  }

  function openEdit(office) {
    setForm({
      name: office.name || '',
      cnpj: office.cnpj || '',
      email: office.email || '',
      phone: office.phone || '',
      evolution_instance_url: office.evolution_instance_url || '',
      evolution_api_key: office.evolution_api_key || '',
      evolution_instance_name: office.evolution_instance_name || '',
      bot_name: office.bot_name || '',
    });
    setActiveTab('dados');
    setModal(office.id);
  }

  function openDelete(office) {
    setModal({ delete: office });
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

  async function handleDelete() {
    await remove(modal.delete.id);
    setModal(null);
  }

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  if (loading) return <div className="loading">Carregando...</div>;

  const isEditing = modal && modal !== 'create' && !modal.delete;

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
              <th>Bot</th>
              <th>Evolution</th>
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
                <td>{o.bot_name || '-'}</td>
                <td>
                  {o.evolution_instance_url ? (
                    <span className="badge badge-success">Configurado</span>
                  ) : (
                    <span className="badge badge-warning" style={{ background: '#f59e0b', color: '#fff' }}>Nao configurado</span>
                  )}
                </td>
                <td>
                  <span className={`badge ${o.active ? 'badge-success' : 'badge-danger'}`}>
                    {o.active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(o)}>Editar</button>{' '}
                  <button className="btn btn-danger btn-sm" onClick={() => openDelete(o)}>Excluir</button>
                </td>
              </tr>
            ))}
            {offices.length === 0 && (
              <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>Nenhum escritorio cadastrado</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Delete confirmation modal */}
      {modal && modal.delete && (
        <Modal title="Confirmar Exclusao" onClose={() => setModal(null)}>
          <p style={{ margin: '1rem 0' }}>
            Tem certeza que deseja excluir o escritorio <strong>{modal.delete.name}</strong>?
          </p>
          <p style={{ margin: '0.5rem 0', color: '#ef4444', fontSize: '0.875rem' }}>
            Esta acao ira remover permanentemente o escritorio e todos os dados associados (empresas, usuarios, mensagens).
          </p>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
            <button type="button" className="btn btn-danger" onClick={handleDelete}>Excluir</button>
          </div>
        </Modal>
      )}

      {/* Create/Edit modal */}
      {(modal === 'create' || isEditing) && (
        <Modal title={modal === 'create' ? 'Novo Escritorio' : 'Editar Escritorio'} onClose={() => setModal(null)}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid #e5e7eb', marginBottom: '1rem' }}>
            <button
              type="button"
              onClick={() => setActiveTab('dados')}
              style={{
                padding: '0.5rem 1rem',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                borderBottom: activeTab === 'dados' ? '2px solid #3b82f6' : '2px solid transparent',
                color: activeTab === 'dados' ? '#3b82f6' : '#6b7280',
                fontWeight: activeTab === 'dados' ? '600' : '400',
                marginBottom: '-2px',
              }}
            >
              Dados do Escritorio
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('bot')}
              style={{
                padding: '0.5rem 1rem',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                borderBottom: activeTab === 'bot' ? '2px solid #3b82f6' : '2px solid transparent',
                color: activeTab === 'bot' ? '#3b82f6' : '#6b7280',
                fontWeight: activeTab === 'bot' ? '600' : '400',
                marginBottom: '-2px',
              }}
            >
              Bot / Evolution API
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Tab: Dados do Escritorio */}
            {activeTab === 'dados' && (
              <>
                <div className="form-group">
                  <label>Nome</label>
                  <input value={form.name} onChange={(e) => set('name', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>CNPJ</label>
                  <input value={form.cnpj} onChange={(e) => set('cnpj', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Telefone</label>
                  <input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
                </div>
                {modal === 'create' && (
                  <>
                    <hr style={{ margin: '1rem 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />
                    <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Administrador do escritorio</p>
                    <div className="form-group">
                      <label>Nome do Admin</label>
                      <input value={form.adminName} onChange={(e) => set('adminName', e.target.value)} required />
                    </div>
                    <div className="form-group">
                      <label>Email do Admin</label>
                      <input type="email" value={form.adminEmail} onChange={(e) => set('adminEmail', e.target.value)} required />
                    </div>
                    <div className="form-group">
                      <label>Senha do Admin</label>
                      <input type="password" value={form.adminPassword} onChange={(e) => set('adminPassword', e.target.value)} required />
                    </div>
                  </>
                )}
              </>
            )}

            {/* Tab: Bot / Evolution API */}
            {activeTab === 'bot' && (
              <>
                <div className="form-group">
                  <label>Nome do Bot</label>
                  <input
                    value={form.bot_name}
                    onChange={(e) => set('bot_name', e.target.value)}
                    placeholder="Ex: Assistente ContabilAI"
                  />
                  <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>Nome que o bot usara nas conversas do WhatsApp</small>
                </div>
                <hr style={{ margin: '1rem 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                  Configuracao da instancia Evolution API para comunicacao via WhatsApp
                </p>
                <div className="form-group">
                  <label>URL da Instancia Evolution</label>
                  <input
                    value={form.evolution_instance_url}
                    onChange={(e) => set('evolution_instance_url', e.target.value)}
                    placeholder="https://evolution.exemplo.com"
                  />
                </div>
                <div className="form-group">
                  <label>API Key da Evolution</label>
                  <input
                    type="password"
                    value={form.evolution_api_key}
                    onChange={(e) => set('evolution_api_key', e.target.value)}
                    placeholder="Chave de API da instancia"
                  />
                </div>
                <div className="form-group">
                  <label>Nome da Instancia</label>
                  <input
                    value={form.evolution_instance_name}
                    onChange={(e) => set('evolution_instance_name', e.target.value)}
                    placeholder="Ex: meu-escritorio"
                  />
                  <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>Identificador da instancia na Evolution API</small>
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
