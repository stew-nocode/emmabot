/**
 * Retire la signature trop large "la base ne contient pas" de l'expression
 * sans_reponse_kb (elle attrape de vraies réponses avec un caveat).
 * GET live → modif chirurgicale → PUT. Ne touche PAS au backup original.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadN8nMcpEnv } from './n8n-env.mjs';
import { pickPutSettings } from './n8n-put-settings.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOW_ID = 'PNc_3uhUfWJosTQi4qWtW';
const INSERT_NODE_ID = '22ccb520-2b9b-48e5-b91c-a9137f07e645';
const { N8N_BASE_URL, N8N_API_KEY } = loadN8nMcpEnv();
const base = N8N_BASE_URL.replace(/\/$/, '');

const res = await fetch(`${base}/api/v1/workflows/${WORKFLOW_ID}`, { headers: { 'X-N8N-API-KEY': N8N_API_KEY } });
const w = JSON.parse(await res.text());
const node = w.nodes.find((n) => n.id === INSERT_NODE_ID);
const OLD = node.parameters.columns.value.sans_reponse_kb;
const NEW = OLD.replace("'la base ne contient pas',", '');
node.parameters.columns.value.sans_reponse_kb = NEW;

const body = { name: w.name, nodes: w.nodes, connections: w.connections, settings: pickPutSettings(w.settings), staticData: w.staticData ?? null };
const put = await fetch(`${base}/api/v1/workflows/${WORKFLOW_ID}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', 'X-N8N-API-KEY': N8N_API_KEY },
  body: JSON.stringify(body),
});
console.log('PUT', put.status, put.ok ? 'OK' : (await put.text()).slice(0, 300));
console.log('\nANCIEN:', OLD);
console.log('\nNOUVEAU:', NEW);
console.log('\nChangé:', OLD !== NEW);
