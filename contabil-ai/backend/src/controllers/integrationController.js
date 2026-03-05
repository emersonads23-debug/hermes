const supabase = require('../config/supabase');
const env = require('../config/env');
const logger = require('../config/logger');
const contaAzulService = require('../services/contaAzulService');
const omieService = require('../services/omieService');

// --- Conta Azul OAuth ---

async function contaAzulAuth(req, res) {
  try {
    const { url } = contaAzulService.generateAuthUrl(req.user.office_id);
    res.json({ url });
  } catch (err) {
    logger.error('Conta Azul auth URL generation failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
}

async function contaAzulCallback(req, res) {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    logger.warn('Conta Azul OAuth denied', { error: oauthError });
    return res.status(400).json({ error: `Autorizacao negada: ${oauthError}` });
  }

  if (!code || !state) {
    return res.status(400).json({ error: 'Parametros code e state sao obrigatorios' });
  }

  // Validate state to prevent CSRF
  const stateEntry = contaAzulService.validateOAuthState(state);
  if (!stateEntry) {
    logger.warn('Conta Azul OAuth invalid state', { state });
    return res.status(400).json({ error: 'Estado OAuth invalido ou expirado. Tente novamente.' });
  }

  try {
    const result = await contaAzulService.exchangeCodeForToken(code, stateEntry.officeId);
    res.json({
      message: 'Conta Azul conectada com sucesso',
      expires_at: result.expires_at,
    });
  } catch (err) {
    logger.error('Conta Azul token exchange failed', { error: err.message });
    res.status(500).json({ error: 'Falha ao conectar Conta Azul. Tente novamente.' });
  }
}

// --- Omie ---

async function saveOmieCredentials(req, res) {
  const { appKey, appSecret } = req.body;

  if (!appKey || !appSecret) {
    return res.status(400).json({ error: 'appKey e appSecret sao obrigatorios' });
  }

  // Validate credentials by making a test API call
  try {
    await omieService.testCredentials(appKey, appSecret);
  } catch (err) {
    logger.warn('Omie credential validation failed', { error: err.message });
    return res.status(400).json({
      error: 'Credenciais Omie invalidas. Verifique app_key e app_secret.',
    });
  }

  const { error } = await supabase.from('integration_tokens').upsert(
    {
      office_id: req.user.office_id,
      provider: 'omie',
      access_token: appKey,
      refresh_token: appSecret,
      expires_at: '2099-12-31T23:59:59Z',
    },
    { onConflict: 'office_id,provider' }
  );

  if (error) {
    return res.status(500).json({ error: 'Falha ao salvar credenciais' });
  }

  res.json({ message: 'Omie configurado e validado com sucesso' });
}

// --- List / Remove ---

async function listIntegrations(req, res) {
  const officeId =
    req.user.role === 'superadmin'
      ? req.query.office_id || req.user.office_id
      : req.user.office_id;

  const { data } = await supabase
    .from('integration_tokens')
    .select('provider, expires_at, created_at, updated_at')
    .eq('office_id', officeId);

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
  const allowed = ['conta_azul', 'omie'];
  if (!allowed.includes(provider)) {
    return res.status(400).json({ error: 'Provedor invalido' });
  }

  await supabase
    .from('integration_tokens')
    .delete()
    .eq('office_id', req.user.office_id)
    .eq('provider', provider);

  logger.info('Integration removed', { officeId: req.user.office_id, provider });
  res.json({ message: 'Integracao removida' });
}

// --- Health Check ---

async function checkIntegrationHealth(req, res) {
  const officeId = req.user.office_id;
  const results = {};

  const { data: tokens } = await supabase
    .from('integration_tokens')
    .select('provider, expires_at')
    .eq('office_id', officeId);

  for (const token of tokens || []) {
    if (token.provider === 'conta_azul') {
      results.conta_azul = await contaAzulService.healthCheck(officeId);
    } else if (token.provider === 'omie') {
      results.omie = await omieService.healthCheck(officeId);
    }
  }

  res.json({ integrations: results });
}

module.exports = {
  contaAzulAuth,
  contaAzulCallback,
  saveOmieCredentials,
  listIntegrations,
  removeIntegration,
  checkIntegrationHealth,
};
