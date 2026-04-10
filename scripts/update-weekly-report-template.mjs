/**
 * Met à jour le HTML du rapport hebdo + le sujet Gmail (workflow n8n bMgFOhb9pKJYxR57).
 */
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { loadN8nMcpEnv } from './n8n-env.mjs';
import { pickPutSettings } from './n8n-put-settings.mjs';

const WORKFLOW_ID = 'bMgFOhb9pKJYxR57';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const jsCode = fs.readFileSync(path.join(__dirname, 'weekly-report-calcul-stats-code.js'), 'utf8');

const NEW_SUBJECT =
  '=Rapport hebdomadaire Assistant IA — {{ $json.dateRange }} · {{ $json.tauxReponse }} % réponse KB';

const { N8N_BASE_URL, N8N_API_KEY } = loadN8nMcpEnv();
const base = N8N_BASE_URL.replace(/\/$/, '');
const headers = {
  'Content-Type': 'application/json',
  'X-N8N-API-KEY': N8N_API_KEY,
};

const res = await fetch(`${base}/api/v1/workflows/${WORKFLOW_ID}`, { headers });
if (!res.ok) throw new Error(`GET ${res.status} ${await res.text()}`);
const w = await res.json();

for (const node of w.nodes) {
  if (node.name === 'Calcul stats hebdo') {
    node.parameters = {
      ...node.parameters,
      jsCode,
    };
  }
  if (node.name === 'Envoi rapport hebdo' && node.parameters) {
    node.parameters.subject = NEW_SUBJECT;
    if (node.parameters.emailType === undefined) node.parameters.emailType = 'html';
  }
}

const body = {
  name: w.name,
  nodes: w.nodes,
  connections: w.connections,
  settings: pickPutSettings(w.settings),
  staticData: w.staticData ?? null,
};

const put = await fetch(`${base}/api/v1/workflows/${WORKFLOW_ID}`, {
  method: 'PUT',
  headers,
  body: JSON.stringify(body),
});
if (!put.ok) throw new Error(`PUT ${put.status} ${await put.text()}`);

const act = await fetch(`${base}/api/v1/workflows/${WORKFLOW_ID}/activate`, {
  method: 'POST',
  headers,
});
if (!act.ok) throw new Error(`activate ${act.status} ${await act.text()}`);

console.log('OK rapport hebdo : template HTML + sujet mis à jour, workflow réactivé.');
