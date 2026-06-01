/**
 * Exporte n'importe quel workflow n8n vers un snapshot JSON versionnable.
 * Lecture seule côté n8n. Retire les secrets en clair des nœuds Code.
 *
 * Usage : node scripts/export-workflow-snapshot.mjs <workflowId> <nom-fichier-sans-ext>
 * Ex.    : node scripts/export-workflow-snapshot.mjs 0N79gbdF8LxmTkny kb-ingestion
 *
 * ⚠️ Vérifier le fichier produit (scan secrets) avant de committer.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadN8nMcpEnv } from './n8n-env.mjs';

const [workflowId, outName] = process.argv.slice(2);
if (!workflowId || !outName) {
  console.error('Usage: node scripts/export-workflow-snapshot.mjs <workflowId> <nom-fichier-sans-ext>');
  process.exit(1);
}

/** Remplace les secrets en clair connus dans le code des nœuds. */
function redactJsCode(code) {
  if (typeof code !== 'string') return code;
  let out = code;
  // Secret de comparaison (auth webhook) : const expected = '...'
  out = out.replace(/(const\s+expected\s*=\s*)'[^']*'/g, "$1'REDACTED_SECRET'");
  out = out.replace(/(const\s+expected\s*=\s*)"[^"]*"/g, '$1"REDACTED_SECRET"');
  return out;
}

function sanitizeNodes(nodes) {
  return nodes.map((node) => {
    const n = structuredClone(node);
    if (n.parameters?.jsCode != null) n.parameters.jsCode = redactJsCode(n.parameters.jsCode);
    return n;
  });
}

const { N8N_BASE_URL, N8N_API_KEY } = loadN8nMcpEnv();
const url = `${N8N_BASE_URL.replace(/\/$/, '')}/api/v1/workflows/${workflowId}`;
const res = await fetch(url, { headers: { 'X-N8N-API-KEY': N8N_API_KEY } });
const text = await res.text();
if (!res.ok) {
  console.error('HTTP', res.status, text.slice(0, 500));
  process.exit(1);
}

const w = JSON.parse(text);
const snapshot = {
  meta: {
    workflowId: w.id,
    workflowName: w.name,
    active: w.active,
    exportedAt: new Date().toISOString(),
    warning: 'Snapshot sanitizé pour Git. Réattacher les credentials dans n8n avant réimport.',
  },
  name: w.name,
  nodes: sanitizeNodes(w.nodes),
  connections: w.connections,
  settings: w.settings ?? {},
  staticData: w.staticData ?? null,
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'n8n', 'workflows');
const outPath = path.join(outDir, `${outName}.snapshot.json`);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), 'utf8');
console.log('OK →', outPath, `(${snapshot.nodes.length} nœuds, actif=${w.active})`);
