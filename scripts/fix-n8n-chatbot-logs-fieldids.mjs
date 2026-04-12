/**
 * Corrige le nœud « Insert Supabase chatbot_logs » : fieldName → fieldId (n8n Supabase 1.2).
 * Sans fieldId, PostgREST renvoie PGRST204 (colonne '').
 *
 * Usage : node scripts/fix-n8n-chatbot-logs-fieldids.mjs
 *
 * Note API n8n (PUT /workflows/:id) : certains champs de `settings` complets
 * provoquent « additional properties » — on envoie un `settings` minimal ; le serveur conserve le reste.
 */
import { loadN8nMcpEnv } from './n8n-env.mjs';

const WORKFLOW_ID = 'PNc_3uhUfWJosTQi4qWtW';
const NODE_ID = 'supa-chatbot-logs-insert-01';

const { N8N_BASE_URL, N8N_API_KEY } = loadN8nMcpEnv();
const base = N8N_BASE_URL.replace(/\/$/, '');
const url = `${base}/api/v1/workflows/${WORKFLOW_ID}`;

const getRes = await fetch(url, {
  headers: { Accept: 'application/json', 'X-N8N-API-KEY': N8N_API_KEY },
});
if (!getRes.ok) {
  console.error('GET', getRes.status, await getRes.text());
  process.exit(1);
}
const wf = await getRes.json();
const node = wf.nodes.find((n) => n.id === NODE_ID);
if (!node) {
  console.error('Nœud introuvable:', NODE_ID);
  process.exit(1);
}

const rows = node?.parameters?.fieldsUi?.fieldValues;
if (!Array.isArray(rows)) {
  console.error('fieldValues manquant');
  process.exit(1);
}

let changed = 0;
for (const row of rows) {
  if (row.fieldName != null && row.fieldName !== '') {
    row.fieldId = row.fieldName;
    delete row.fieldName;
    changed++;
  }
}
if (changed === 0) {
  console.log('Rien à corriger (déjà fieldId).');
  process.exit(0);
}

const putBody = {
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings: {
    executionOrder: wf.settings?.executionOrder || 'v1',
    timezone: wf.settings?.timezone || 'Europe/Paris',
  },
};

const putRes = await fetch(url, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-N8N-API-KEY': N8N_API_KEY,
  },
  body: JSON.stringify(putBody),
});
const text = await putRes.text();
if (!putRes.ok) {
  console.error('PUT', putRes.status, text.slice(0, 3000));
  process.exit(1);
}
console.log('OK —', changed, 'champ(s) fieldName → fieldId sur', NODE_ID);
