const supabase = require('../config/supabase');
const whatsappService = require('../services/whatsappService');
const logger = require('../config/logger');

async function getStats(req, res) {
  try {
    const [offices, companies, users, documents, messages, tasks] = await Promise.all([
      supabase.from('offices').select('id', { count: 'exact', head: true }),
      supabase.from('companies').select('id', { count: 'exact', head: true }),
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase.from('documents').select('id', { count: 'exact', head: true }),
      supabase.from('messages').select('id', { count: 'exact', head: true }),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    ]);

    res.json({
      stats: {
        offices: offices.count || 0,
        companies: companies.count || 0,
        users: users.count || 0,
        documents_processed: documents.count || 0,
        messages_processed: messages.count || 0,
        tasks_open: tasks.count || 0,
      },
    });
  } catch (err) {
    logger.error('Failed to get admin stats', { error: err.message });
    res.status(500).json({ error: 'Erro ao buscar estatisticas' });
  }
}

async function getWhatsappInstances(req, res) {
  try {
    const { data: offices } = await supabase
      .from('offices')
      .select('id, name')
      .eq('active', true)
      .order('name');

    const instances = [];
    for (const office of offices || []) {
      let status = { state: 'unknown' };
      try {
        status = await whatsappService.getInstanceStatus();
      } catch { /* ignore */ }

      // Count today's messages for this office
      const today = new Date().toISOString().split('T')[0];
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('office_id', office.id)
        .gte('created_at', today);

      instances.push({
        office_id: office.id,
        office_name: office.name,
        state: status.state || 'unknown',
        messages_today: count || 0,
      });
    }

    res.json({ instances });
  } catch (err) {
    logger.error('Failed to get WhatsApp instances', { error: err.message });
    res.status(500).json({ error: 'Erro ao buscar instancias WhatsApp' });
  }
}

async function reconnectWhatsapp(req, res) {
  try {
    await whatsappService.createInstance();
    res.json({ message: 'Instancia reconectada' });
  } catch (err) {
    logger.error('WhatsApp reconnect failed', { error: err.message });
    res.status(500).json({ error: 'Erro ao reconectar WhatsApp' });
  }
}

async function getWhatsappQr(req, res) {
  try {
    const status = await whatsappService.getInstanceStatus();
    res.json({ qr: status.qrcode || null, state: status.state });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao obter QR code' });
  }
}

async function getErpIntegrations(req, res) {
  try {
    const { data: integrations } = await supabase
      .from('integration_tokens')
      .select('*, office:offices(name)')
      .order('created_at', { ascending: false });

    // Get companies with their ERP info
    const { data: companies } = await supabase
      .from('companies')
      .select('id, name, erp_type, office_id, office:offices(name)')
      .not('erp_type', 'is', null)
      .order('name');

    res.json({
      integrations: integrations || [],
      companies: companies || [],
    });
  } catch (err) {
    logger.error('Failed to get ERP integrations', { error: err.message });
    res.status(500).json({ error: 'Erro ao buscar integracoes ERP' });
  }
}

async function testErpConnection(req, res) {
  const { provider, office_id } = req.body;
  try {
    if (provider === 'conta_azul') {
      const contaAzulService = require('../services/contaAzulService');
      const result = await contaAzulService.healthCheck(office_id);
      return res.json({ success: result.healthy, details: result });
    }
    if (provider === 'omie') {
      const omieService = require('../services/omieService');
      const result = await omieService.healthCheck(office_id);
      return res.json({ success: result.healthy, details: result });
    }
    res.status(400).json({ error: 'Provedor invalido' });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
}

module.exports = {
  getStats,
  getWhatsappInstances,
  reconnectWhatsapp,
  getWhatsappQr,
  getErpIntegrations,
  testErpConnection,
};
