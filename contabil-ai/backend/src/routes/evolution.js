const { Router } = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const axios = require('axios');
const env = require('../config/env');
const supabase = require('../config/supabase');
const logger = require('../config/logger');

const router = Router();

const evoApi = axios.create({
  baseURL: env.evolution.apiUrl,
  headers: { apikey: env.evolution.apiKey },
  timeout: 15000,
});

router.use(authenticate);
router.use(authorize('superadmin', 'office_admin'));

// Get instance status for an office
router.get('/:officeId/status', asyncHandler(async (req, res) => {
  const { data: office } = await supabase
    .from('offices')
    .select('evolution_instance_name')
    .eq('id', req.params.officeId)
    .single();

  if (!office?.evolution_instance_name) {
    return res.json({ configured: false, state: 'not_configured' });
  }

  if (!env.evolution.apiUrl || !env.evolution.apiKey) {
    return res.json({ configured: true, instance: office.evolution_instance_name, state: 'api_not_configured', error: 'Evolution API nao configurada no servidor' });
  }

  try {
    const response = await evoApi.get(`/instance/connectionState/${office.evolution_instance_name}`);
    res.json({ configured: true, instance: office.evolution_instance_name, ...response.data });
  } catch {
    res.json({ configured: true, instance: office.evolution_instance_name, state: 'disconnected', error: 'Evolution API indisponivel' });
  }
}));

// Create instance for an office
router.post('/:officeId/create', asyncHandler(async (req, res) => {
  const { instanceName } = req.body;
  if (!instanceName) return res.status(400).json({ error: 'instanceName is required' });

  // Check if office already has an instance
  const { data: office } = await supabase
    .from('offices')
    .select('evolution_instance_name')
    .eq('id', req.params.officeId)
    .single();

  if (office?.evolution_instance_name) {
    return res.status(400).json({ error: 'Escritorio ja possui uma instancia configurada' });
  }

  try {
    const response = await evoApi.post('/instance/create', {
      instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
      webhook: `${env.apiUrl}/api/webhook/evolution`,
      webhookByEvents: true,
      webhookBase64: true,
      events: ['messages.upsert', 'connection.update', 'qrcode.updated'],
    });

    // Save instance name to office
    await supabase
      .from('offices')
      .update({ evolution_instance_name: instanceName })
      .eq('id', req.params.officeId);

    logger.info('Evolution instance created for office', { officeId: req.params.officeId, instanceName });
    res.status(201).json({ instance: instanceName, ...response.data });
  } catch (err) {
    const status = err.response?.status;
    if (status === 401) {
      logger.error('Evolution API authentication failed - check EVOLUTION_API_KEY');
      return res.status(502).json({ error: 'Falha na autenticacao com Evolution API. Verifique a chave de API.' });
    }
    if (status === 403 || status === 409) {
      // Instance already exists in Evolution, just save reference
      await supabase
        .from('offices')
        .update({ evolution_instance_name: instanceName })
        .eq('id', req.params.officeId);

      return res.status(201).json({ instance: instanceName, existing: true });
    }
    logger.error('Failed to create Evolution instance', { error: err.message, status });
    res.status(502).json({ error: err.response?.data?.message || err.response?.data?.error || 'Erro ao comunicar com Evolution API' });
  }
}));

// Get QR code for an office instance
router.get('/:officeId/qrcode', asyncHandler(async (req, res) => {
  const { data: office } = await supabase
    .from('offices')
    .select('evolution_instance_name')
    .eq('id', req.params.officeId)
    .single();

  if (!office?.evolution_instance_name) {
    return res.status(400).json({ error: 'Instancia nao configurada' });
  }

  try {
    const response = await evoApi.get(`/instance/connect/${office.evolution_instance_name}`);
    res.json(response.data);
  } catch (err) {
    if (err.response?.status === 401) {
      return res.status(502).json({ error: 'Falha na autenticacao com Evolution API' });
    }
    res.status(502).json({ error: err.response?.data?.message || 'Erro ao obter QR Code' });
  }
}));

// Disconnect instance
router.post('/:officeId/disconnect', asyncHandler(async (req, res) => {
  const { data: office } = await supabase
    .from('offices')
    .select('evolution_instance_name')
    .eq('id', req.params.officeId)
    .single();

  if (!office?.evolution_instance_name) {
    return res.status(400).json({ error: 'Instancia nao configurada' });
  }

  try {
    await evoApi.delete(`/instance/logout/${office.evolution_instance_name}`);
    res.json({ message: 'Instancia desconectada' });
  } catch (err) {
    if (err.response?.status === 401) {
      return res.status(502).json({ error: 'Falha na autenticacao com Evolution API' });
    }
    res.status(502).json({ error: err.response?.data?.message || 'Erro ao desconectar' });
  }
}));

// Remove instance from office
router.delete('/:officeId/instance', asyncHandler(async (req, res) => {
  const { data: office } = await supabase
    .from('offices')
    .select('evolution_instance_name')
    .eq('id', req.params.officeId)
    .single();

  if (!office?.evolution_instance_name) {
    return res.status(400).json({ error: 'Instancia nao configurada' });
  }

  try {
    await evoApi.delete(`/instance/delete/${office.evolution_instance_name}`);
  } catch { /* ignore if instance doesn't exist */ }

  await supabase
    .from('offices')
    .update({ evolution_instance_name: null })
    .eq('id', req.params.officeId);

  res.json({ message: 'Instancia removida' });
}));

module.exports = router;
