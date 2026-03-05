const { createClient } = require('@supabase/supabase-js');
const env = require('./env');
const logger = require('./logger');

if (!env.supabase.url || !env.supabase.serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

async function retryFetch(fn, { retries = 3, baseDelay = 500 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        const delay = baseDelay * Math.pow(2, attempt);
        logger.warn(`Supabase request failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${delay}ms`, {
          error: err.message,
        });
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

const supabase = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  db: {
    schema: 'public',
  },
  global: {
    headers: { 'x-application-name': 'contabil-ai' },
    fetch: (...args) => {
      return retryFetch(() => fetch(...args), { retries: 3, baseDelay: 500 });
    },
  },
});

// Public client for anon-level operations (if needed in future)
const supabasePublic = env.supabase.anonKey
  ? createClient(env.supabase.url, env.supabase.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

async function healthCheck() {
  try {
    const start = Date.now();
    const { data, error } = await supabase.from('offices').select('id').limit(1);
    const latency = Date.now() - start;

    if (error && error.code !== 'PGRST116') {
      return { healthy: false, latency, error: error.message };
    }

    return { healthy: true, latency, provider: 'supabase' };
  } catch (err) {
    return { healthy: false, latency: -1, error: err.message };
  }
}

async function testConnection() {
  const result = await healthCheck();
  if (result.healthy) {
    logger.info(`Supabase connected (${result.latency}ms)`);
  } else {
    logger.error('Supabase connection failed', { error: result.error });
  }
  return result;
}

module.exports = supabase;
module.exports.supabasePublic = supabasePublic;
module.exports.healthCheck = healthCheck;
module.exports.testConnection = testConnection;
