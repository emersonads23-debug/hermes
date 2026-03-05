const axios = require('axios');
const supabase = require('../config/supabase');
const logger = require('../config/logger');

const BASE_URL = 'https://app.omie.com.br/api/v1';
const REQUEST_TIMEOUT = 30000;
const MAX_RETRIES = 2;

// --- Credential Management ---

async function getCredentials(officeId) {
  const { data: creds, error } = await supabase
    .from('integration_tokens')
    .select('*')
    .eq('office_id', officeId)
    .eq('provider', 'omie')
    .single();

  if (error || !creds) {
    throw new Error('Omie nao configurado para este escritorio. Configure pelo painel.');
  }

  return { appKey: creds.access_token, appSecret: creds.refresh_token };
}

async function testCredentials(appKey, appSecret) {
  const response = await axios.post(
    `${BASE_URL}/geral/empresas/`,
    {
      call: 'ListarEmpresas',
      app_key: appKey,
      app_secret: appSecret,
      param: [{ pagina: 1, registros_por_pagina: 1 }],
    },
    { timeout: REQUEST_TIMEOUT }
  );

  // Omie returns faultstring on auth errors
  if (response.data.faultstring) {
    throw new Error(response.data.faultstring);
  }

  return response.data;
}

// --- API Calls with retry & error mapping ---

async function apiCall(officeId, endpoint, method, params = {}, retries = MAX_RETRIES) {
  const { appKey, appSecret } = await getCredentials(officeId);
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await axios.post(
        `${BASE_URL}${endpoint}`,
        {
          call: method,
          app_key: appKey,
          app_secret: appSecret,
          param: [params],
        },
        { timeout: REQUEST_TIMEOUT }
      );

      // Omie returns errors inside the response body, not as HTTP errors
      if (response.data.faultstring) {
        const faultCode = response.data.faultcode || '';
        const faultMsg = response.data.faultstring;

        // Auth failures — no point retrying
        if (faultMsg.includes('app_key') || faultMsg.includes('app_secret') || faultCode === 'SOAP-ENV:Client-102') {
          logger.error('Omie authentication failed', { officeId, faultCode, faultMsg });
          throw new Error(`Omie autenticacao falhou: ${faultMsg}`);
        }

        // Rate limit
        if (faultCode === 'SOAP-ENV:Client-5' || faultMsg.includes('limite')) {
          if (attempt < retries) {
            const delay = 2000 * Math.pow(2, attempt);
            logger.warn('Omie rate limited, retrying', { faultMsg, delay, attempt });
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
        }

        throw new Error(`Omie erro: ${faultMsg}`);
      }

      return response.data;
    } catch (err) {
      lastError = err;

      // Already a mapped error (auth, Omie fault)
      if (err.message.startsWith('Omie')) throw err;

      // Network / timeout — retry with backoff
      if (attempt < retries && (err.code === 'ECONNABORTED' || err.code === 'ECONNRESET' || !err.response)) {
        const delay = 1000 * Math.pow(2, attempt);
        logger.warn('Omie network error, retrying', { error: err.message, delay, attempt });
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      // 5xx from Omie proxy
      if (err.response?.status >= 500 && attempt < retries) {
        const delay = 1000 * Math.pow(2, attempt);
        logger.warn('Omie server error, retrying', { status: err.response.status, delay });
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
    }
  }

  logger.error('Omie API call failed after retries', {
    officeId,
    endpoint,
    method,
    error: lastError.message,
  });
  throw lastError;
}

// --- Business Methods ---

async function listInvoices(officeId, page = 1) {
  return apiCall(officeId, '/produtos/nfconsultar/', 'ConsultarNF', {
    nPagina: page,
    nRegPorPagina: 20,
  });
}

async function getAccountsPayable(officeId, page = 1) {
  return apiCall(officeId, '/financas/contapagar/', 'ListarContasPagar', {
    nPagina: page,
    nRegPorPagina: 20,
  });
}

async function getAccountsReceivable(officeId, page = 1) {
  return apiCall(officeId, '/financas/contareceber/', 'ListarContasReceber', {
    nPagina: page,
    nRegPorPagina: 20,
  });
}

async function getFinancialSummary(officeId) {
  const [payable, receivable] = await Promise.all([
    getAccountsPayable(officeId),
    getAccountsReceivable(officeId),
  ]);
  return { payable, receivable };
}

async function getClients(officeId, page = 1) {
  return apiCall(officeId, '/geral/clientes/', 'ListarClientes', {
    pagina: page,
    registros_por_pagina: 20,
  });
}

async function healthCheck(officeId) {
  try {
    const { appKey, appSecret } = await getCredentials(officeId);
    await testCredentials(appKey, appSecret);
    return { healthy: true, provider: 'omie' };
  } catch (err) {
    return { healthy: false, provider: 'omie', error: err.message };
  }
}

module.exports = {
  testCredentials,
  getCredentials,
  listInvoices,
  getAccountsPayable,
  getAccountsReceivable,
  getFinancialSummary,
  getClients,
  healthCheck,
};
