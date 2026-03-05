const supabase = require('../config/supabase');
const logger = require('../config/logger');
const contaAzulService = require('../services/contaAzulService');
const omieService = require('../services/omieService');
const { encrypt } = require('../utils/crypto');

// --- Conta Azul (manual token entry) ---

async function saveContaAzulCredentials(req, res) {
  const { company_id, client_id, client_secret, access_token, refresh_token, expires_in } = req.body;

  if (!company_id || !client_id || !client_secret || !access_token || !refresh_token) {
    return res.status(400).json({
      error: 'company_id, client_id, client_secret, access_token e refresh_token sao obrigatorios',
    });
  }

  try {
    const result = await contaAzulService.saveTokens(company_id, {
      clientId: client_id,
      clientSecret: client_secret,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresIn: expires_in || 3600,
    });

    res.json({ message: 'Conta Azul configurada com sucesso', expires_at: result.expires_at });
  } catch (err) {
    logger.error('Failed to save Conta Azul credentials', { error: err.message });
    res.status(500).json({ error: err.message });
  }
}

// --- Omie ---

async function saveOmieCredentials(req, res) {
  const { appKey, appSecret, company_id } = req.body;

  if (!appKey || !appSecret || !company_id) {
    return res.status(400).json({ error: 'appKey, appSecret e company_id sao obrigatorios' });
  }

  try {
    await omieService.testCredentials(appKey, appSecret);
  } catch (err) {
    logger.warn('Omie credential validation failed', { error: err.message });
    return res.status(400).json({
      error: 'Credenciais Omie invalidas. Verifique app_key e app_secret.',
    });
  }

  const { data: company } = await supabase
    .from('companies')
    .select('office_id')
    .eq('id', company_id)
    .single();

  const { error } = await supabase.from('integration_tokens').upsert(
    {
      company_id,
      office_id: company?.office_id,
      provider: 'omie',
      access_token: encrypt(appKey),
      refresh_token: encrypt(appSecret),
      expires_at: '2099-12-31T23:59:59Z',
    },
    { onConflict: 'company_id,provider' }
  );

  if (error) {
    return res.status(500).json({ error: 'Falha ao salvar credenciais' });
  }

  res.json({ message: 'Omie configurado e validado com sucesso' });
}

// --- List / Remove ---

async function listIntegrations(req, res) {
  const { company_id } = req.query;

  if (!company_id) {
    return res.status(400).json({ error: 'company_id e obrigatorio' });
  }

  const { data } = await supabase
    .from('integration_tokens')
    .select('provider, expires_at, created_at, updated_at')
    .eq('company_id', company_id);

  const integrations = (data || []).map((i) => ({
    ...i,
    status:
      i.provider === 'omie'
        ? 'active'
        : new Date(i.expires_at) > new Date()
          ? 'active'
          : 'expired',
  }));

  res.json({ integrations });
}

async function removeIntegration(req, res) {
  const { provider } = req.params;
  const { company_id } = req.query;
  const allowed = ['conta_azul', 'omie'];

  if (!allowed.includes(provider)) {
    return res.status(400).json({ error: 'Provedor invalido' });
  }
  if (!company_id) {
    return res.status(400).json({ error: 'company_id e obrigatorio' });
  }

  await supabase
    .from('integration_tokens')
    .delete()
    .eq('company_id', company_id)
    .eq('provider', provider);

  logger.info('Integration removed', { companyId: company_id, provider });
  res.json({ message: 'Integracao removida' });
}

// --- Health Check ---

async function checkIntegrationHealth(req, res) {
  const { company_id } = req.query;

  if (!company_id) {
    return res.status(400).json({ error: 'company_id e obrigatorio' });
  }

  const results = {};

  const { data: tokens } = await supabase
    .from('integration_tokens')
    .select('provider, expires_at')
    .eq('company_id', company_id);

  for (const token of tokens || []) {
    if (token.provider === 'conta_azul') {
      results.conta_azul = await contaAzulService.healthCheck(company_id);
    } else if (token.provider === 'omie') {
      results.omie = await omieService.healthCheck(company_id);
    }
  }

  res.json({ integrations: results });
}

module.exports = {
  saveContaAzulCredentials,
  saveOmieCredentials,
  listIntegrations,
  removeIntegration,
  checkIntegrationHealth,
};
