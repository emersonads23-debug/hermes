#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../database/migrations');
const showStatus = process.argv.includes('--status');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function ensureMigrationTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ DEFAULT NOW(),
      checksum VARCHAR(64) NOT NULL
    )
  `);
}

function fileChecksum(content) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

async function getExecutedMigrations() {
  const { rows } = await pool.query('SELECT name, executed_at, checksum FROM _migrations ORDER BY id');
  return rows;
}

async function getPendingMigrations() {
  const executed = await getExecutedMigrations();
  const executedNames = new Set(executed.map((m) => m.name));

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const pending = [];
  for (const file of files) {
    if (!executedNames.has(file)) {
      const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      pending.push({ name: file, content, checksum: fileChecksum(content) });
    }
  }

  return pending;
}

async function runMigrations() {
  await ensureMigrationTable();

  if (showStatus) {
    const executed = await getExecutedMigrations();
    const pending = await getPendingMigrations();

    console.log('\n=== Migration Status ===\n');
    console.log('Executed:');
    if (executed.length === 0) {
      console.log('  (none)');
    } else {
      for (const m of executed) {
        console.log(`  [OK] ${m.name} (${new Date(m.executed_at).toISOString()}) checksum:${m.checksum}`);
      }
    }
    console.log('\nPending:');
    if (pending.length === 0) {
      console.log('  (none - all up to date)');
    } else {
      for (const m of pending) {
        console.log(`  [ ] ${m.name}`);
      }
    }
    console.log('');
    await pool.end();
    return;
  }

  const pending = await getPendingMigrations();

  if (pending.length === 0) {
    console.log('All migrations are up to date.');
    await pool.end();
    return;
  }

  console.log(`\nRunning ${pending.length} migration(s)...\n`);

  const client = await pool.connect();
  try {
    for (const migration of pending) {
      console.log(`  Running: ${migration.name}`);
      const start = Date.now();

      await client.query('BEGIN');
      try {
        await client.query(migration.content);
        await client.query(
          'INSERT INTO _migrations (name, checksum) VALUES ($1, $2)',
          [migration.name, migration.checksum]
        );
        await client.query('COMMIT');

        const elapsed = Date.now() - start;
        console.log(`  Done:    ${migration.name} (${elapsed}ms)`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  FAILED:  ${migration.name}`);
        console.error(`  Error:   ${err.message}`);
        process.exit(1);
      }
    }

    console.log(`\nAll ${pending.length} migration(s) completed successfully.\n`);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error('Migration error:', err.message);
  process.exit(1);
});
