const axios = require('axios');
const supabase = require('../config/supabase');
const logger = require('../config/logger');

const BASE_URL = 'https://app.omie.com.br/api/v1';

async function getCredentials(officeId) {
  const { data: creds } = await supabase
    .from('integration_tokens')
    .select('*')
    .eq('office_id', officeId)
    .eq('provider', 'omie')
    .single();

  if (!creds) throw new Error('Omie nao configurado para este escritorio');
  return { appKey: creds.access_token, appSecret: creds.refresh_token };
}

async function apiCall(officeId, endpoint, method, params = {}) {
  const { appKey, appSecret } = await getCredentials(officeId);

  const response = await axios.post(`${BASE_URL}${endpoint}`, {
    call: method,
    app_key: appKey,
    app_secret: appSecret,
    param: [params],
  });

  return response.data;
}

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

module.exports = {
  listInvoices,
  getAccountsPayable,
  getAccountsReceivable,
  getFinancialSummary,
  getClients,
};
