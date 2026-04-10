/**
 * Corrige le nœud Data Table du workflow rapport hebdo.
 * n8n utilise operation "get" (pas getMany) pour lister les lignes.
 */
import { loadN8nMcpEnv } from './n8n-env.mjs';
import { pickPutSettings } from './n8n-put-settings.mjs';

const WORKFLOW_ID = 'bMgFOhb9pKJYxR57';
const { N8N_BASE_URL, N8N_API_KEY } = loadN8nMcpEnv();
const base = N8N_BASE_URL.replace(/\/$/, '');
const headers = {
  'Content-Type': 'application/json',
  'X-N8N-API-KEY': N8N_API_KEY,
};

const res = await fetch(`${base}/api/v1/workflows/${WORKFLOW_ID}`, { headers });
if (!res.ok) throw new Error(`GET ${res.status}`);
const w = await res.json();

for (const node of w.nodes) {
  if (node.name !== 'Logs chatbot support') continue;
  node.parameters = {
    resource: 'row',
    operation: 'get',
    dataTableId: node.parameters.dataTableId,
    matchType: 'anyCondition',
    filters: { conditions: [] },
    returnAll: true,
    orderBy: false,
  };
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

console.log('OK Data Table corrigé + workflow réactivé');
