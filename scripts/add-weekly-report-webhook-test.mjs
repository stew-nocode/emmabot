/**
 * Ajoute un Webhook GET au workflow rapport hebdo (si absent) et déclenche une exécution test.
 * Usage : node scripts/add-weekly-report-webhook-test.mjs
 */
import { randomUUID } from 'crypto';
import { loadN8nMcpEnv } from './n8n-env.mjs';
import { pickPutSettings } from './n8n-put-settings.mjs';

const WORKFLOW_ID = 'bMgFOhb9pKJYxR57';
const WEBHOOK_PATH = 'rapport-emma-hebdo-test';

const { N8N_BASE_URL, N8N_API_KEY } = loadN8nMcpEnv();
const base = N8N_BASE_URL.replace(/\/$/, '');

const headers = {
  'Content-Type': 'application/json',
  'X-N8N-API-KEY': N8N_API_KEY,
};

async function getWorkflow() {
  const res = await fetch(`${base}/api/v1/workflows/${WORKFLOW_ID}`, { headers });
  if (!res.ok) throw new Error(`GET workflow ${res.status} ${await res.text()}`);
  return res.json();
}

function pickPutBody(w) {
  return {
    name: w.name,
    nodes: w.nodes,
    connections: w.connections,
    settings: pickPutSettings(w.settings),
    staticData: w.staticData ?? null,
  };
}

async function putWorkflow(body) {
  const res = await fetch(`${base}/api/v1/workflows/${WORKFLOW_ID}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT workflow ${res.status} ${await res.text()}`);
  return res.json();
}

let w = await getWorkflow();
const hasWebhook = w.nodes.some((n) => n.name === 'Webhook test rapport');

if (!hasWebhook) {
  const webhookId = randomUUID();
  const webhookNode = {
    parameters: {
      httpMethod: 'GET',
      path: WEBHOOK_PATH,
      responseMode: 'lastNode',
      options: {},
    },
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: [-220, 200],
    id: 'webhook-rapport-hebdo-test',
    name: 'Webhook test rapport',
    webhookId,
  };
  w.nodes.push(webhookNode);
  w.connections['Webhook test rapport'] = {
    main: [[{ node: 'Logs chatbot support', type: 'main', index: 0 }]],
  };
  await putWorkflow(pickPutBody(w));
  console.log('Webhook ajouté.');
}

// active est read-only sur PUT ; activation manuelle requise dans n8n pour le webhook production.

const url = `${base}/webhook/${WEBHOOK_PATH}`;
console.log('GET', url);
const res = await fetch(url, { method: 'GET' });
const text = await res.text();
console.log('Status:', res.status);
console.log(text.slice(0, 500));
