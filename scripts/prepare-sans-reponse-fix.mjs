/**
 * PRÉPARE (sans pousser) le fix de détection sans_reponse_kb.
 * 1. GET le workflow chatbot live.
 * 2. Backup brut → ../.n8n_chatbot_backup.json (pour rollback).
 * 3. Remplace UNIQUEMENT l'expression sans_reponse_kb du nœud actif
 *    "Insert rows in a table" (id 22ccb520...) par un matcher NORMALISÉ
 *    (insensible accents/encodage).
 * 4. Écrit le corps PUT → ../.n8n_put_chatbot_body.json (poussé par push-chatbot-workflow.mjs).
 * Affiche l'ANCIEN et le NOUVEAU + des garde-fous (rien d'autre ne change).
 *
 * Usage : node scripts/prepare-sans-reponse-fix.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadN8nMcpEnv } from './n8n-env.mjs';
import { pickPutSettings } from './n8n-put-settings.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOW_ID = 'PNc_3uhUfWJosTQi4qWtW';
const INSERT_NODE_ID = '22ccb520-2b9b-48e5-b91c-a9137f07e645';

// Matcher normalisé : on enlève accents + on remplace toute ponctuation par des espaces,
// puis on cherche des signatures d'escalade / hors-sujet / lacune KB. Insensible à
// l'encodage corrompu du system message ET aux reformulations accentuées.
const NEW_SANS_REPONSE =
  "={{ ['necessite l avis','transmis immediatement','transmise en priorite','ne concerne pas','la base ne contient pas','je n ai pas cette information','je transmets'].some(p => $('AI Agent').item.json.output.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').includes(p)) }}";

const { N8N_BASE_URL, N8N_API_KEY } = loadN8nMcpEnv();
const base = N8N_BASE_URL.replace(/\/$/, '');

const res = await fetch(`${base}/api/v1/workflows/${WORKFLOW_ID}`, {
  headers: { 'X-N8N-API-KEY': N8N_API_KEY },
});
if (!res.ok) {
  console.error('GET HTTP', res.status, (await res.text()).slice(0, 400));
  process.exit(1);
}
const w = JSON.parse(await res.text());

// Backup brut
const backupPath = path.join(__dirname, '..', '.n8n_chatbot_backup.json');
fs.writeFileSync(backupPath, JSON.stringify(w, null, 2), 'utf8');

const node = w.nodes.find((n) => n.id === INSERT_NODE_ID);
if (!node?.parameters?.columns?.value) {
  console.error('Nœud insert ou colonne introuvable — abandon.');
  process.exit(1);
}
const OLD = node.parameters.columns.value.sans_reponse_kb;
node.parameters.columns.value.sans_reponse_kb = NEW_SANS_REPONSE;

const body = {
  name: w.name,
  nodes: w.nodes,
  connections: w.connections,
  settings: pickPutSettings(w.settings),
  staticData: w.staticData ?? null,
};
fs.writeFileSync(path.join(__dirname, '..', '.n8n_put_chatbot_body.json'), JSON.stringify(body), 'utf8');

console.log('=== ANCIEN sans_reponse_kb ===\n' + OLD);
console.log('\n=== NOUVEAU sans_reponse_kb ===\n' + NEW_SANS_REPONSE);
console.log('\n=== Garde-fous (doit rester identique) ===');
console.log('Nb de nœuds        :', w.nodes.length);
console.log('Nb de connexions   :', Object.keys(w.connections).length);
console.log('Taille system msg  :', (w.nodes.find((n) => n.name === 'AI Agent')?.parameters?.options?.systemMessage || '').length, 'car. (inchangé)');
console.log('\nBackup écrit       :', backupPath);
console.log('Corps PUT prêt     : emmabot/.n8n_put_chatbot_body.json (NON poussé)');
