const { Pool } = require('pg');
const env = require('./env');
const logger = require('./logger');

let pool = null;

function getPool() {
  if (pool) return pool;

  if (!env.supabase.databaseUrl) {
    throw new Error('DATABASE_URL is required for direct PostgreSQL access');
  }

  pool = new Pool({
    connectionString: env.supabase.databaseUrl,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: env.nodeEnv === 'production' ? { rejectUnauthorized: true } : false,
  });

  pool.on('error', (err) => {
    logger.error('PostgreSQL pool unexpected error', { error: err.message });
  });

  pool.on('connect', () => {
    logger.debug('New PostgreSQL connection established');
  });

  return pool;
}

async function query(text, params) {
  const start = Date.now();
  const result = await getPool().query(text, params);
  const duration = Date.now() - start;

  logger.debug('SQL query executed', {
    text: text.substring(0, 100),
    duration,
    rows: result.rowCount,
  });

  return result;
}

async function getClient() {
  return getPool().connect();
}

async function transaction(fn) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function healthCheck() {
  try {
    const start = Date.now();
    const result = await query('SELECT NOW() AS now, current_database() AS db');
    const latency = Date.now() - start;
    return {
      healthy: true,
      provider: 'postgresql',
      latency,
      database: result.rows[0].db,
      serverTime: result.rows[0].now,
      poolTotal: pool?.totalCount || 0,
      poolIdle: pool?.idleCount || 0,
      poolWaiting: pool?.waitingCount || 0,
    };
  } catch (err) {
    return { healthy: false, provider: 'postgresql', error: err.message };
  }
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('PostgreSQL pool closed');
  }
}

module.exports = { getPool, query, getClient, transaction, healthCheck, close };
