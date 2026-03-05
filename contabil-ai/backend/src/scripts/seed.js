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

const SEEDS_DIR = path.resolve(__dirname, '../../../database/seeds');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function runSeeds() {
  const files = fs.readdirSync(SEEDS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No seed files found.');
    await pool.end();
    return;
  }

  console.log(`\nRunning ${files.length} seed(s)...\n`);

  for (const file of files) {
    console.log(`  Seeding: ${file}`);
    const content = fs.readFileSync(path.join(SEEDS_DIR, file), 'utf-8');
    try {
      await pool.query(content);
      console.log(`  Done:    ${file}`);
    } catch (err) {
      console.error(`  FAILED:  ${file} - ${err.message}`);
    }
  }

  console.log('\nSeeding complete.\n');
  await pool.end();
}

runSeeds().catch((err) => {
  console.error('Seed error:', err.message);
  process.exit(1);
});
