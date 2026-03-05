import { useState, useEffect } from 'react';
import api from '../services/api';

const STATE_BADGE = {
  open: 'badge-success',
  close: 'badge-danger',
  connecting: 'badge-warning',
  unknown: 'badge-warning',
};

const STATE_LABEL = {
  open: 'Conectado',
  close: 'Desconectado',
  connecting: 'Conectando...',
  unknown: 'Desconhecido',
};

export default function WhatsAppInstances() {
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [qrModal, setQrModal] = useState(null);
  const [qrData, setQrData] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => { loadInstances(); }, []);

  async function loadInstances() {
    try {
      const res = await api.get('/admin/whatsapp-instances');
      setInstances(res.data.instances || []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function showQr() {
    setQrLoading(true);
    setQrModal(true);
    try {
      const res = await api.get('/admin/whatsapp/qr');
      setQrData(res.data);
    } catch {
      setQrData({ error: 'Falha ao obter QR code' });
    }
    setQrLoading(false);
  }

  async function reconnect() {
    setActionLoading('reconnect');
    try {
      await api.post('/admin/whatsapp/reconnect');
      await loadInstances();
    } catch { /* ignore */ }
    setActionLoading(null);
  }

  if (loading) return <div className="loading">Carregando...</div>;

  return (
    <div>
      <div className="main-header">
        <h1>WhatsApp Instances</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-primary" onClick={showQr}>Exibir QR Code</button>
          <button className="btn btn-secondary" onClick={reconnect} disabled={actionLoading === 'reconnect'}>
            {actionLoading === 'reconnect' ? 'Reconectando...' : 'Reconectar'}
          </button>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Escritorio</th>
              <th>Status</th>
              <th>Mensagens Hoje</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {instances.map((inst) => (
              <tr key={inst.office_id}>
                <td><strong>{inst.office_name}</strong></td>
                <td>
                  <span className={`badge ${STATE_BADGE[inst.state] || 'badge-warning'}`}>
                    {STATE_LABEL[inst.state] || inst.state}
                  </span>
                </td>
                <td>{inst.messages_today}</td>
                <td>
                  <button className="btn btn-secondary btn-sm" onClick={showQr}>QR</button>{' '}
                  <button className="btn btn-secondary btn-sm" onClick={reconnect}>Reconectar</button>
                </td>
              </tr>
            ))}
            {instances.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-light)', padding: '2rem' }}>Nenhuma instancia encontrada</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {qrModal && (
        <div className="modal-overlay" onClick={() => setQrModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
            <h2>QR Code WhatsApp</h2>
            {qrLoading ? (
              <p style={{ padding: '2rem', color: 'var(--text-light)' }}>Carregando QR code...</p>
            ) : qrData?.qr ? (
              <div>
                <img src={qrData.qr} alt="QR Code" style={{ maxWidth: '300px', margin: '1rem auto' }} />
                <p style={{ color: 'var(--text-light)', fontSize: '0.85rem' }}>Escaneie com o WhatsApp para conectar</p>
              </div>
            ) : (
              <div style={{ padding: '2rem' }}>
                <p style={{ color: 'var(--text-light)' }}>
                  {qrData?.state === 'open'
                    ? 'Instancia ja esta conectada.'
                    : qrData?.error || 'QR code nao disponivel. Tente reconectar a instancia.'}
                </p>
              </div>
            )}
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={() => setQrModal(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
