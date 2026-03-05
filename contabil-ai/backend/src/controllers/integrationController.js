const axios = require('axios');
const supabase = require('../config/supabase');
const env = require('../config/env');

async function contaAzulAuth(req, res) {
  const authUrl = `https://api.contaazul.com/auth/authorize?redirect_uri=${encodeURIComponent(env.contaAzul.redirectUri)}&client_id=${env.contaAzul.clientId}&scope=sales+purchases+financial&response_type=code`;
  res.json({ url: authUrl });
}

async function contaAzulCallback(req, res) {
  const { code } = req.query;

  const response = await axios.post('https://api.contaazul.com/oauth2/token', {
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.contaAzul.redirectUri,
    client_id: env.contaAzul.clientId,
    client_secret: env.contaAzul.clientSecret,
  });

  const { access_token, refresh_token, expires_in } = response.data;
  const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

  await supabase.from('integration_tokens').upsert({
    office_id: req.user.office_id,
    provider: 'conta_azul',
    access_token,
    refresh_token,
    expires_at: expiresAt,
  }, { onConflict: 'office_id,provider' });

  res.json({ message: 'Conta Azul conectada com sucesso' });
}

async function saveOmieCredentials(req, res) {
  const { appKey, appSecret } = req.body;

  await supabase.from('integration_tokens').upsert({
    office_id: req.user.office_id,
    provider: 'omie',
    access_token: appKey,
    refresh_token: appSecret,
    expires_at: '2099-12-31T23:59:59Z',
  }, { onConflict: 'office_id,provider' });

  res.json({ message: 'Omie configurado com sucesso' });
}

async function listIntegrations(req, res) {
  const officeId = req.user.role === 'superadmin'
    ? req.query.office_id || req.user.office_id
    : req.user.office_id;

  const { data } = await supabase
    .from('integration_tokens')
    .select('provider, expires_at, created_at')
    .eq('office_id', officeId);

  res.json({ integrations: data || [] });
}

async function removeIntegration(req, res) {
  const { provider } = req.params;
  await supabase
    .from('integration_tokens')
    .delete()
    .eq('office_id', req.user.office_id)
    .eq('provider', provider);

  res.json({ message: 'Integracao removida' });
}

module.exports = {
  contaAzulAuth,
  contaAzulCallback,
  saveOmieCredentials,
  listIntegrations,
  removeIntegration,
};
