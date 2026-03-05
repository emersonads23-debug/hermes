const axios = require('axios');
const crypto = require('crypto');
const supabase = require('../config/supabase');
const env = require('../config/env');
const logger = require('../config/logger');
const { encrypt, decrypt } = require('../utils/crypto');

const AUTH_URL = 'https://api.contaazul.com/auth/authorize';
const TOKEN_URL = 'https://api.contaazul.com/oauth2/token';
const BASE_URL = 'https://api.contaazul.com/v1';

// In-memory OAuth state store (short-lived, keyed by state param)
const pendingOAuthStates = new Map();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// --- OAuth Flow ---

function generateAuthUrl(companyId) {
  if (!env.contaAzul.clientId || !env.contaAzul.redirectUri) {
    throw new Error('Conta Azul client_id and redirect_uri must be configured');
  }

  const state = crypto.randomBytes(32).toString('hex');
  pendingOAuthStates.set(state, { companyId, createdAt: Date.now() });

  // Cleanup expired states
  for (const [key, val] of pendingOAuthStates) {
    if (Date.now() - val.createdAt > STATE_TTL_MS) pendingOAuthStates.delete(key);
  }

  const params = new URLSearchParams({
    redirect_uri: env.contaAzul.redirectUri,
    client_id: env.contaAzul.clientId,
    scope: 'sales purchases financial',
    response_type: 'code',
    state,
  });

  return { url: `${AUTH_URL}?${params}`, state };
}

function validateOAuthState(state) {
  const entry = pendingOAuthStates.get(state);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > STATE_TTL_MS) {
    pendingOAuthStates.delete(state);
    return null;
  }
  pendingOAuthStates.delete(state);
  return entry;
}

async function exchangeCodeForToken(code, companyId) {
  logger.info('Exchanging Conta Azul auth code for token', { companyId });

  const basicAuth = Buffer.from(
    `${env.contaAzul.clientId}:${env.contaAzul.clientSecret}`
  ).toString('base64');

  const response = await axios.post(TOKEN_URL, null, {
    params: {
      grant_type: 'authorization_code',
      code,
      redirect_uri: env.contaAzul.redirectUri,
    },
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    timeout: 15000,
  });

  const { access_token, refresh_token, expires_in } = response.data;
  const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

  // Get office_id from company
  const { data: company } = await supabase
    .from('companies')
    .select('office_id')
    .eq('id', companyId)
    .single();

  const { error } = await supabase.from('integration_tokens').upsert(
    {
      company_id: companyId,
      office_id: company?.office_id,
      provider: 'conta_azul',
      access_token: encrypt(access_token),
      refresh_token: encrypt(refresh_token),
      expires_at: expiresAt,
    },
    { onConflict: 'company_id,provider' }
  );

  if (error) throw new Error(`Failed to store Conta Azul token: ${error.message}`);

  logger.info('Conta Azul token stored (encrypted)', { companyId, expiresAt });
  return { access_token, expires_at: expiresAt };
}

// --- Token Management ---

async function getAccessToken(companyId) {
  const { data: token, error } = await supabase
    .from('integration_tokens')
    .select('*')
    .eq('company_id', companyId)
    .eq('provider', 'conta_azul')
    .single();

  if (error || !token) {
    throw new Error('Conta Azul nao configurada para esta empresa. Conecte pelo painel.');
  }

  // Decrypt stored tokens
  const accessToken = decrypt(token.access_token);
  const refreshToken = decrypt(token.refresh_token);

  // Refresh if expiring within 5 minutes
  const bufferMs = 5 * 60 * 1000;
  if (new Date(token.expires_at).getTime() - Date.now() <= bufferMs) {
    logger.info('Conta Azul token expiring soon, refreshing', { companyId });
    return refreshAccessToken(companyId, refreshToken);
  }

  return accessToken;
}

async function refreshAccessToken(companyId, currentRefreshToken) {
  try {
    const basicAuth = Buffer.from(
      `${env.contaAzul.clientId}:${env.contaAzul.clientSecret}`
    ).toString('base64');

    const response = await axios.post(TOKEN_URL, null, {
      params: {
        grant_type: 'refresh_token',
        refresh_token: currentRefreshToken,
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      timeout: 15000,
    });

    const { access_token, refresh_token: newRefresh, expires_in } = response.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    await supabase
      .from('integration_tokens')
      .update({
        access_token: encrypt(access_token),
        refresh_token: encrypt(newRefresh || currentRefreshToken),
        expires_at: expiresAt,
      })
      .eq('company_id', companyId)
      .eq('provider', 'conta_azul');

    logger.info('Conta Azul token refreshed (encrypted)', { companyId, expiresAt });
    return access_token;
  } catch (err) {
    logger.error('Conta Azul token refresh failed', {
      companyId,
      status: err.response?.status,
      error: err.response?.data || err.message,
    });

    // If refresh token is revoked, mark as expired so admin re-auths
    if (err.response?.status === 401 || err.response?.status === 400) {
      await supabase
        .from('integration_tokens')
        .update({ expires_at: new Date(0).toISOString() })
        .eq('company_id', companyId)
        .eq('provider', 'conta_azul');
    }

    throw new Error('Sessao do Conta Azul expirou. Reconecte pelo painel administrativo.');
  }
}

// --- API Calls with retry ---

async function apiCall(companyId, method, path, data = null, retries = 2) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const accessToken = await getAccessToken(companyId);
      const response = await axios({
        method,
        url: `${BASE_URL}${path}`,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        data,
        timeout: 30000,
      });
      return response.data;
    } catch (err) {
      lastError = err;

      // 401 → force token refresh and retry
      if (err.response?.status === 401 && attempt < retries) {
        logger.warn('Conta Azul 401, forcing token refresh', { companyId, path, attempt });
        const { data: token } = await supabase
          .from('integration_tokens')
          .select('refresh_token')
          .eq('company_id', companyId)
          .eq('provider', 'conta_azul')
          .single();
        if (token) {
          try { await refreshAccessToken(companyId, decrypt(token.refresh_token)); continue; } catch { /* fall through */ }
        }
      }

      // 429 → respect Retry-After header
      if (err.response?.status === 429 && attempt < retries) {
        const retryAfter = parseInt(err.response.headers['retry-after'], 10) || 5;
        logger.warn('Conta Azul rate limited', { retryAfter, attempt });
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }

      // 5xx → exponential backoff
      if (err.response?.status >= 500 && attempt < retries) {
        const delay = 1000 * Math.pow(2, attempt);
        logger.warn('Conta Azul server error, retrying', { status: err.response.status, delay });
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
    }
  }

  logger.error('Conta Azul API call failed', {
    companyId,
    status: lastError.response?.status,
    error: lastError.response?.data || lastError.message,
  });
  throw lastError;
}

// --- Business Methods ---

async function getInvoices(companyId, filters = {}) {
  const params = new URLSearchParams(filters).toString();
  return apiCall(companyId, 'GET', `/sales${params ? `?${params}` : ''}`);
}

async function getFinancialSummary(companyId) {
  const [receivables, payables] = await Promise.all([
    apiCall(companyId, 'GET', '/financial/bills-to-receive'),
    apiCall(companyId, 'GET', '/financial/bills-to-pay'),
  ]);
  return { receivables, payables };
}

async function getCustomers(companyId, search = '') {
  return apiCall(companyId, 'GET', `/customers?search=${encodeURIComponent(search)}`);
}

async function healthCheck(companyId) {
  try {
    const token = await getAccessToken(companyId);
    return { healthy: true, provider: 'conta_azul', hasToken: !!token };
  } catch (err) {
    return { healthy: false, provider: 'conta_azul', error: err.message };
  }
}

module.exports = {
  generateAuthUrl,
  validateOAuthState,
  exchangeCodeForToken,
  getAccessToken,
  getInvoices,
  getFinancialSummary,
  getCustomers,
  healthCheck,
};
