/**
 * Applique uniquement la chaîne légère (sans réécriture du prompt système).
 * Usage : node apply-chatbot-light-chain.mjs <workflow-export.json>
 * Puis : node push-chatbot-workflow.mjs
 */
import fs from 'fs';
import { fileURLToPath } from 'url';
import { pickPutSettings } from './n8n-put-settings.mjs';
import { applyLightChain } from './chatbot-light-chain.mjs';

const srcPath = process.argv[2];
if (!srcPath) {
  console.error('Usage: node apply-chatbot-light-chain.mjs <workflow.json>');
  process.exit(1);
}

const w = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
const changed = applyLightChain(w);
const body = {
  name: w.name,
  nodes: w.nodes,
  connections: w.connections,
  settings: pickPutSettings(w.settings),
  staticData: w.staticData ?? null,
};

const outPath = fileURLToPath(new URL('../.n8n_put_chatbot_body.json', import.meta.url));
fs.writeFileSync(outPath, JSON.stringify(body), 'utf8');
console.log(
  changed
    ? 'Chaîne légère appliquée → .n8n_put_chatbot_body.json'
    : 'Nœuds passe-plat déjà absents ; graphe / expressions mis à jour → .n8n_put_chatbot_body.json',
);
