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

  try {
    const response = await evoApi.get(`/instance/connectionState/${office.evolution_instance_name}`);
    res.json({ configured: true, instance: office.evolution_instance_name, ...response.data });
  } catch (err) {
    res.json({ configured: true, instance: office.evolution_instance_name, state: 'disconnected', error: err.message });
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
    if (err.response?.status === 403 || err.response?.status === 409) {
      // Instance already exists in Evolution, just save reference
      await supabase
        .from('offices')
        .update({ evolution_instance_name: instanceName })
        .eq('id', req.params.officeId);

      return res.status(201).json({ instance: instanceName, existing: true });
    }
    logger.error('Failed to create Evolution instance', { error: err.message });
    res.status(500).json({ error: err.response?.data?.message || err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
