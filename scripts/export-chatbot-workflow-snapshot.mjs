/**
 * GET workflow chatbot sur n8n, retire les secrets des nœuds Code, écrit un JSON versionnable.
 * Usage : node scripts/export-chatbot-workflow-snapshot.mjs
 *
 * Ne commitez jamais le secret Emma : il est remplacé par REDACTED_Emma_SECRET.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadN8nMcpEnv } from './n8n-env.mjs';

const WORKFLOW_ID = 'PNc_3uhUfWJosTQi4qWtW';

function redactJsCode(code) {
  if (typeof code !== 'string') return code;
  let out = code;
  out = out.replace(/(const\s+expected\s*=\s*)'[^']*'/g, "$1'REDACTED_Emma_SECRET'");
  out = out.replace(/(const\s+expected\s*=\s*)"[^"]*"/g, '$1"REDACTED_Emma_SECRET"');
  return out;
}

function sanitizeNodes(nodes) {
  return nodes.map((node) => {
    const n = structuredClone(node);
    if (n.parameters?.jsCode != null) {
      n.parameters.jsCode = redactJsCode(n.parameters.jsCode);
    }
    return n;
  });
}

function buildSnapshot(apiWorkflow) {
  return {
    meta: {
      workflowId: apiWorkflow.id,
      workflowName: apiWorkflow.name,
      exportedAt: new Date().toISOString(),
      warning:
        'Fichier sanitizé pour Git : remplacer REDACTED_Emma_SECRET dans le nœud Code auth avant toute réimportation brute ; réattacher les credentials dans n8n si besoin.',
    },
    name: apiWorkflow.name,
    nodes: sanitizeNodes(apiWorkflow.nodes),
    connections: apiWorkflow.connections,
    settings: apiWorkflow.settings ?? {},
    staticData: apiWorkflow.staticData ?? null,
  };
}

const { N8N_BASE_URL, N8N_API_KEY } = loadN8nMcpEnv();
const url = `${N8N_BASE_URL.replace(/\/$/, '')}/api/v1/workflows/${WORKFLOW_ID}`;
const res = await fetch(url, {
  headers: { 'X-N8N-API-KEY': N8N_API_KEY },
});

const text = await res.text();
if (!res.ok) {
  console.error('HTTP', res.status, text.slice(0, 500));
  process.exit(1);
}

const w = JSON.parse(text);
const snapshot = buildSnapshot(w);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'n8n', 'workflows');
const outPath = path.join(outDir, 'chatbot.snapshot.json');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), 'utf8');
console.log('OK →', outPath);
