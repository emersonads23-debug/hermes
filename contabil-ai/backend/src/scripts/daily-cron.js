#!/usr/bin/env node

/**
 * Daily analysis cron job.
 *
 * Run via:
 *   node src/scripts/daily-cron.js
 *
 * Schedule with system cron:
 *   0 6 * * * cd /app && node src/scripts/daily-cron.js >> logs/cron.log 2>&1
 *
 * Or trigger via n8n daily-report workflow.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const logger = require('../config/logger');

async function main() {
  logger.info('Daily cron job started');

  try {
    const { runDailyAnalysis } = require('../analysis/dailyAnalysis');
    await runDailyAnalysis();
    logger.info('Daily cron job completed successfully');
    process.exit(0);
  } catch (err) {
    logger.error('Daily cron job failed', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

main();
