import { useState, useEffect } from 'react';
import useCrud from '../hooks/useCrud';
import Modal from '../components/Modal';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const ERP_LABELS = { conta_azul: 'Conta Azul', omie: 'Omie' };

export default function Companies() {
  const { data: companies, loading, create, update, remove } = useCrud('/companies');
  const { user } = useAuth();
  const [offices, setOffices] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [jsonPaste, setJsonPaste] = useState('');

  useEffect(() => {
    if (user.role === 'superadmin') {
      api.get('/offices').then((res) => setOffices(res.data.offices || [])).catch(() => {});
    }
  }, [user.role]);

  function openCreate() {
    setForm({
      name: '', cnpj: '', email: '', phone: '',
      office_id: '', erp_type: '', erp_token: '', erp_refresh_token: '',
      whatsapp_phone: '',
    });
    setJsonPaste('');
    setModal('create');
  }

  function openEdit(c) {
    setForm({
      name: c.name, cnpj: c.cnpj, email: c.email || '', phone: c.phone || '',
      erp_type: c.erp_type || '', erp_token: c.erp_token || '',
      erp_refresh_token: c.erp_refresh_token || '', whatsapp_phone: c.whatsapp_phone || '',
    });
    setJsonPaste('');
    setModal(c.id);
  }

  function handleJsonPaste(value) {
    setJsonPaste(value);
    try {
      const parsed = JSON.parse(value);
      setForm((prev) => ({
        ...prev,
        erp_token: parsed.access_token || parsed.token || parsed.appKey || parsed.app_key || prev.erp_token,
        erp_refresh_token: parsed.refresh_token || parsed.appSecret || parsed.app_secret || prev.erp_refresh_token,
      }));
    } catch { /* not valid JSON yet */ }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form };
      if (!payload.erp_type) {
        delete payload.erp_type;
        delete payload.erp_token;
        delete payload.erp_refresh_token;
      }
      if (!payload.office_id) delete payload.office_id;
      if (modal === 'create') {
        await create(payload);
      } else {
        await update(modal, payload);
      }
      setModal(null);
    } catch { /* error handled by useCrud */ }
    setSaving(false);
  }

  const filtered = companies.filter((c) =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.cnpj?.includes(search) ||
    c.whatsapp_phone?.includes(search)
  );

  if (loading) return <div className="loading">Carregando...</div>;

  return (
    <div>
      <div className="main-header">
        <h1>Empresas</h1>
        <button className="btn btn-primary" onClick={openCreate}>Nova Empresa</button>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <input
          placeholder="Buscar por nome, CNPJ ou WhatsApp..."
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
              <th>CNPJ</th>
              <th>Escritorio</th>
              <th>ERP</th>
              <th>WhatsApp</th>
              <th>Status</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.name}</strong></td>
                <td>{c.cnpj}</td>
                <td>{c.office?.name || '-'}</td>
                <td>{c.erp_type ? <span className="badge badge-info">{ERP_LABELS[c.erp_type] || c.erp_type}</span> : <span style={{ color: 'var(--text-light)' }}>-</span>}</td>
                <td>{c.whatsapp_phone || '-'}</td>
                <td><span className={`badge ${c.active !== false ? 'badge-success' : 'badge-danger'}`}>{c.active !== false ? 'Ativa' : 'Inativa'}</span></td>
                <td>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(c)}>Editar</button>{' '}
                  <button className="btn btn-danger btn-sm" onClick={() => remove(c.id)}>Desativar</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-light)', padding: '2rem' }}>Nenhuma empresa encontrada</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal === 'create' ? 'Nova Empresa' : 'Editar Empresa'} onClose={() => setModal(null)}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Nome</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>CNPJ</label>
              <input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} required />
            </div>
            {user.role === 'superadmin' && modal === 'create' && (
              <div className="form-group">
                <label>Escritorio</label>
                <select value={form.office_id} onChange={(e) => setForm({ ...form, office_id: e.target.value })} required>
                  <option value="">Selecione...</option>
                  {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="form-group">
                <label>WhatsApp</label>
                <input value={form.whatsapp_phone} onChange={(e) => setForm({ ...form, whatsapp_phone: e.target.value })} placeholder="5511999999999" />
              </div>
            </div>

            <hr style={{ margin: '1rem 0', border: 'none', borderTop: '1px solid var(--border)' }} />
            <p style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--primary)' }}>Integracao ERP</p>

            <div className="form-group">
              <label>ERP</label>
              <select value={form.erp_type} onChange={(e) => setForm({ ...form, erp_type: e.target.value })}>
                <option value="">Nenhum</option>
                <option value="conta_azul">Conta Azul</option>
                <option value="omie">Omie</option>
              </select>
            </div>

            {form.erp_type && (
              <>
                <div className="form-group">
                  <label>Colar JSON de tokens (opcional)</label>
                  <textarea
                    value={jsonPaste}
                    onChange={(e) => handleJsonPaste(e.target.value)}
                    placeholder='{"access_token": "...", "refresh_token": "..."}'
                    rows={3}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.85rem', fontFamily: 'monospace', resize: 'vertical' }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div className="form-group">
                    <label>{form.erp_type === 'omie' ? 'App Key' : 'Access Token'}</label>
                    <input value={form.erp_token} onChange={(e) => setForm({ ...form, erp_token: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>{form.erp_type === 'omie' ? 'App Secret' : 'Refresh Token'}</label>
                    <input value={form.erp_refresh_token} onChange={(e) => setForm({ ...form, erp_refresh_token: e.target.value })} />
                  </div>
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
