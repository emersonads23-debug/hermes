const axios = require('axios');
const supabase = require('../config/supabase');
const env = require('../config/env');
const logger = require('../config/logger');

const BASE_URL = 'https://api.contaazul.com/v1';

async function getAccessToken(officeId) {
  const { data: token } = await supabase
    .from('integration_tokens')
    .select('*')
    .eq('office_id', officeId)
    .eq('provider', 'conta_azul')
    .single();

  if (!token) throw new Error('Conta Azul nao configurada para este escritorio');

  if (new Date(token.expires_at) <= new Date()) {
    return refreshToken(officeId, token.refresh_token);
  }

  return token.access_token;
}

async function refreshToken(officeId, refreshToken) {
  const response = await axios.post('https://api.contaazul.com/oauth2/token', {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: env.contaAzul.clientId,
    client_secret: env.contaAzul.clientSecret,
  });

  const { access_token, refresh_token, expires_in } = response.data;
  const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

  await supabase
    .from('integration_tokens')
    .update({
      access_token,
      refresh_token: refresh_token,
      expires_at: expiresAt,
    })
    .eq('office_id', officeId)
    .eq('provider', 'conta_azul');

  return access_token;
}

async function apiCall(officeId, method, path, data = null) {
  const accessToken = await getAccessToken(officeId);
  const response = await axios({
    method,
    url: `${BASE_URL}${path}`,
    headers: { Authorization: `Bearer ${accessToken}` },
    data,
  });
  return response.data;
}

async function getInvoices(officeId, filters = {}) {
  const params = new URLSearchParams(filters).toString();
  return apiCall(officeId, 'GET', `/sales?${params}`);
}

async function getFinancialSummary(officeId) {
  const [receivables, payables] = await Promise.all([
    apiCall(officeId, 'GET', '/financial/bills-to-receive'),
    apiCall(officeId, 'GET', '/financial/bills-to-pay'),
  ]);
  return { receivables, payables };
}

async function getCustomers(officeId, search = '') {
  return apiCall(officeId, 'GET', `/customers?search=${encodeURIComponent(search)}`);
}

module.exports = {
  getAccessToken,
  getInvoices,
  getFinancialSummary,
  getCustomers,
};
