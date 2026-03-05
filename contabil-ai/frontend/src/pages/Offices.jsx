import { useState } from 'react';
import useCrud from '../hooks/useCrud';
import Modal from '../components/Modal';
import api from '../services/api';

export default function Offices() {
  const { data: offices, loading, create, update, remove, fetchAll } = useCrud('/offices');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [evoModal, setEvoModal] = useState(null);
  const [evoStatus, setEvoStatus] = useState(null);
  const [evoLoading, setEvoLoading] = useState(false);
  const [instanceName, setInstanceName] = useState('');
  const [qrCode, setQrCode] = useState(null);

  function openCreate() {
    setForm({ name: '', cnpj: '', email: '', phone: '', adminName: '', adminEmail: '', adminPassword: '' });
    setError('');
    setModal('create');
  }

  function openEdit(office) {
    setForm({ name: office.name, cnpj: office.cnpj, email: office.email, phone: office.phone || '', bot_name: office.bot_name || '' });
    setError('');
    setModal(office.id);
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
      setError(err.response?.data?.error || 'Erro ao salvar escritorio');
    }
  }

  async function handleReactivate(id) {
    try {
      await api.post(`/offices/${id}/reactivate`);
      await fetchAll();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao reativar');
    }
  }

  async function openEvolution(office) {
    setEvoModal(office);
    setEvoLoading(true);
    setEvoStatus(null);
    setQrCode(null);
    setInstanceName('');
    try {
      const res = await api.get(`/evolution/${office.id}/status`);
      setEvoStatus(res.data);
    } catch (err) {
      setEvoStatus({ configured: false, state: 'not_configured', error: err.response?.data?.error || 'Evolution API indisponivel' });
    }
    setEvoLoading(false);
  }

  async function handleCreateInstance() {
    if (!instanceName.trim()) return;
    setEvoLoading(true);
    try {
      await api.post(`/evolution/${evoModal.id}/create`, { instanceName: instanceName.trim() });
      const res = await api.get(`/evolution/${evoModal.id}/status`);
      setEvoStatus(res.data);
      await fetchAll();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao criar instancia');
    }
    setEvoLoading(false);
  }

  async function handleGetQrCode() {
    setEvoLoading(true);
    try {
      const res = await api.get(`/evolution/${evoModal.id}/qrcode`);
      setQrCode(res.data);
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao obter QR Code');
    }
    setEvoLoading(false);
  }

  async function handleDisconnect() {
    setEvoLoading(true);
    try {
      await api.post(`/evolution/${evoModal.id}/disconnect`);
      const res = await api.get(`/evolution/${evoModal.id}/status`);
      setEvoStatus(res.data);
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao desconectar');
    }
    setEvoLoading(false);
  }

  async function handleRemoveInstance() {
    if (!confirm('Tem certeza que deseja remover a instancia?')) return;
    setEvoLoading(true);
    try {
      await api.delete(`/evolution/${evoModal.id}/instance`);
      setEvoStatus({ configured: false, state: 'not_configured' });
      await fetchAll();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao remover instancia');
    }
    setEvoLoading(false);
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
              <th>WhatsApp</th>
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
                <td>
                  {o.evolution_instance_name
                    ? <span className="badge badge-success">{o.evolution_instance_name}</span>
                    : <span className="badge badge-danger">Nao configurado</span>
                  }
                </td>
                <td><span className={`badge ${o.active ? 'badge-success' : 'badge-danger'}`}>{o.active ? 'Ativo' : 'Inativo'}</span></td>
                <td>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(o)}>Editar</button>{' '}
                  <button className="btn btn-primary btn-sm" onClick={() => openEvolution(o)}>WhatsApp</button>{' '}
                  {o.active
                    ? <button className="btn btn-danger btn-sm" onClick={() => remove(o.id)}>Desativar</button>
                    : <button className="btn btn-success btn-sm" onClick={() => handleReactivate(o.id)}>Reativar</button>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal === 'create' ? 'Novo Escritorio' : 'Editar Escritorio'} onClose={() => setModal(null)}>
          <form onSubmit={handleSubmit}>
            {error && <div className="alert alert-danger">{error}</div>}
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
            <div className="form-group">
              <label>Nome do Bot (WhatsApp)</label>
              <input value={form.bot_name || ''} onChange={(e) => setForm({ ...form, bot_name: e.target.value })} placeholder="Ex: Julia, Assistente Eximia..." />
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

      {evoModal && (
        <Modal title={`WhatsApp - ${evoModal.name}`} onClose={() => { setEvoModal(null); setQrCode(null); }}>
          {evoLoading && <div className="loading">Carregando...</div>}

          {evoStatus && !evoStatus.configured && (
            <div>
              <p>Nenhuma instancia configurada para este escritorio.</p>
              <div className="form-group">
                <label>Nome da Instancia</label>
                <input
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                  placeholder="ex: eximia-whatsapp"
                />
              </div>
              <button className="btn btn-primary" onClick={handleCreateInstance} disabled={evoLoading}>
                Criar Instancia
              </button>
            </div>
          )}

          {evoStatus && evoStatus.configured && (
            <div>
              <p><strong>Instancia:</strong> {evoStatus.instance}</p>
              <p><strong>Status:</strong>{' '}
                <span className={`badge ${evoStatus.state === 'open' ? 'badge-success' : 'badge-danger'}`}>
                  {evoStatus.state === 'open' ? 'Conectado' : evoStatus.state || 'Desconectado'}
                </span>
              </p>

              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {evoStatus.state !== 'open' && (
                  <button className="btn btn-primary" onClick={handleGetQrCode} disabled={evoLoading}>
                    Gerar QR Code
                  </button>
                )}
                {evoStatus.state === 'open' && (
                  <button className="btn btn-danger" onClick={handleDisconnect} disabled={evoLoading}>
                    Desconectar
                  </button>
                )}
                <button className="btn btn-danger" onClick={handleRemoveInstance} disabled={evoLoading}>
                  Remover Instancia
                </button>
              </div>

              {qrCode && qrCode.base64 && (
                <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                  <p>Escaneie o QR Code com o WhatsApp:</p>
                  <img src={qrCode.base64} alt="QR Code" style={{ maxWidth: '300px' }} />
                </div>
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
