/**
 * Crée (ou met à jour) le workflow "alerte-backlog-kb" dans n8n.
 * Usage : node scripts/push-alerte-backlog-workflow.mjs
 *
 * Première exécution : POST (création) → affiche l'ID créé.
 * Exécutions suivantes : renseigner WORKFLOW_ID ci-dessous pour faire un PUT.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadN8nMcpEnv } from './n8n-env.mjs';
import { pickPutSettings } from './n8n-put-settings.mjs';

const WORKFLOW_ID = process.env.ALERTE_BACKLOG_WORKFLOW_ID || 'Gn8ihoga8I325GYa';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { N8N_BASE_URL, N8N_API_KEY } = loadN8nMcpEnv();
const base = N8N_BASE_URL.replace(/\/$/, '');
const headers = { 'Content-Type': 'application/json', 'X-N8N-API-KEY': N8N_API_KEY };

const snapshot = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'n8n', 'workflows', 'alerte-backlog.snapshot.json'), 'utf8'),
);

const body = {
  name: snapshot.name,
  nodes: snapshot.nodes,
  connections: snapshot.connections,
  settings: pickPutSettings(snapshot.settings),
  staticData: snapshot.staticData ?? null,
};

let workflowId = WORKFLOW_ID;

if (!workflowId) {
  // Création
  const res = await fetch(`${base}/api/v1/workflows`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`POST ${res.status}`, await res.text());
    process.exit(1);
  }
  const created = await res.json();
  workflowId = created.id;
  console.log(`Workflow créé, ID : ${workflowId}`);
  console.log(`→ Ajouter dans alerte-backlog.snapshot.json (meta.workflowId) pour les prochains push.`);
} else {
  // Mise à jour
  const res = await fetch(`${base}/api/v1/workflows/${workflowId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`PUT ${res.status}`, await res.text());
    process.exit(1);
  }
  console.log(`OK 200 workflow alerte-backlog-kb mis à jour (${workflowId})`);
}

// Activation
const act = await fetch(`${base}/api/v1/workflows/${workflowId}/activate`, {
  method: 'POST',
  headers,
});
if (!act.ok) {
  console.warn(`activate ${act.status} (non bloquant) :`, await act.text());
} else {
  console.log('Workflow activé.');
}
