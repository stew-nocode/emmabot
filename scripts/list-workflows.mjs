/**
 * Liste les workflows de l'instance n8n (id, nom, actif).
 * Lecture seule. Usage : node scripts/list-workflows.mjs
 * N'affiche jamais la clé API.
 */
import { loadN8nMcpEnv } from './n8n-env.mjs';

const { N8N_BASE_URL, N8N_API_KEY } = loadN8nMcpEnv();
const base = N8N_BASE_URL.replace(/\/$/, '');
console.log('Instance :', base);

const res = await fetch(`${base}/api/v1/workflows?limit=250`, {
  headers: { 'X-N8N-API-KEY': N8N_API_KEY },
});
const text = await res.text();
if (!res.ok) {
  console.error('HTTP', res.status, text.slice(0, 400));
  process.exit(1);
}
const { data } = JSON.parse(text);
console.log(`${data.length} workflow(s) :\n`);
for (const w of data) {
  console.log(`${w.active ? '🟢' : '⚪'} ${w.id}  ${w.name}`);
}
