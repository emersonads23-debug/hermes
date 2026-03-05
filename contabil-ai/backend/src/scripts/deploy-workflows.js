#!/usr/bin/env node

/**
 * Deploy n8n workflow JSON files via the n8n REST API.
 *
 * Usage:
 *   node deploy-workflows.js              # deploy all workflows
 *   node deploy-workflows.js --dry-run    # show what would be deployed
 *
 * Requires N8N_API_URL and N8N_API_KEY (or N8N_USER/N8N_PASSWORD) in .env
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const WORKFLOWS_DIR = path.resolve(__dirname, '../../../automations/workflows');
const N8N_BASE = (process.env.N8N_API_URL || process.env.N8N_WEBHOOK_URL || 'http://localhost:5678').replace('/webhook', '');

const dryRun = process.argv.includes('--dry-run');

function getAuth() {
  if (process.env.N8N_API_KEY) {
    return { headers: { 'X-N8N-API-KEY': process.env.N8N_API_KEY } };
  }
  const user = process.env.N8N_USER;
  const pass = process.env.N8N_PASSWORD;
  if (!user || !pass) {
    throw new Error('N8N_USER and N8N_PASSWORD (or N8N_API_KEY) must be set in environment');
  }
  return { auth: { username: user, password: pass } };
}

async function getExistingWorkflows() {
  try {
    const response = await axios.get(`${N8N_BASE}/api/v1/workflows`, {
      ...getAuth(),
      timeout: 10000,
    });
    return response.data?.data || response.data || [];
  } catch (err) {
    console.error(`Failed to list existing workflows: ${err.message}`);
    return [];
  }
}

async function createWorkflow(workflow) {
  const response = await axios.post(`${N8N_BASE}/api/v1/workflows`, workflow, {
    ...getAuth(),
    headers: { ...getAuth().headers, 'Content-Type': 'application/json' },
    timeout: 15000,
  });
  return response.data;
}

async function updateWorkflow(id, workflow) {
  const response = await axios.patch(`${N8N_BASE}/api/v1/workflows/${id}`, workflow, {
    ...getAuth(),
    headers: { ...getAuth().headers, 'Content-Type': 'application/json' },
    timeout: 15000,
  });
  return response.data;
}

async function activateWorkflow(id) {
  await axios.post(`${N8N_BASE}/api/v1/workflows/${id}/activate`, null, {
    ...getAuth(),
    timeout: 10000,
  });
}

async function main() {
  console.log(`n8n Workflow Deployer`);
  console.log(`Target: ${N8N_BASE}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'DEPLOY'}\n`);

  if (!fs.existsSync(WORKFLOWS_DIR)) {
    console.error(`Workflows directory not found: ${WORKFLOWS_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    console.log('No workflow files found.');
    return;
  }

  console.log(`Found ${files.length} workflow file(s):\n`);

  const existing = dryRun ? [] : await getExistingWorkflows();
  const existingByName = new Map(existing.map((w) => [w.name, w]));

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const file of files) {
    const filePath = path.join(WORKFLOWS_DIR, file);
    let workflow;
    try {
      workflow = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      console.error(`  [ERROR] ${file}: Invalid JSON - ${err.message}`);
      failed++;
      continue;
    }

    const name = workflow.name || path.basename(file, '.json');
    const existingWf = existingByName.get(name);

    if (dryRun) {
      console.log(`  [${existingWf ? 'UPDATE' : 'CREATE'}] ${name} (${file})`);
      continue;
    }

    try {
      if (existingWf) {
        await updateWorkflow(existingWf.id, workflow);
        console.log(`  [UPDATED] ${name} (id: ${existingWf.id})`);
        updated++;
      } else {
        const result = await createWorkflow(workflow);
        console.log(`  [CREATED] ${name} (id: ${result.id})`);
        created++;

        // Auto-activate webhook-triggered workflows
        if (workflow.nodes?.some((n) => n.type === 'n8n-nodes-base.webhook')) {
          try {
            await activateWorkflow(result.id);
            console.log(`  [ACTIVATED] ${name}`);
          } catch {
            console.warn(`  [WARN] Could not auto-activate ${name}`);
          }
        }
      }
    } catch (err) {
      console.error(`  [ERROR] ${name}: ${err.response?.data?.message || err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. Created: ${created}, Updated: ${updated}, Failed: ${failed}`);
}

main().catch((err) => {
  console.error('Deploy failed:', err.message);
  process.exit(1);
});
