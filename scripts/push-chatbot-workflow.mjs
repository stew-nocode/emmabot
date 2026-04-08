/**
 * PUT workflow chatbot vers n8n (même API que MCP n8n).
 * Usage : node scripts/push-chatbot-workflow.mjs
 * Lit le corps depuis ../.n8n_put_chatbot_body.json (généré par build-n8n-chatbot-put-body.mjs).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mcpPath = path.join(process.env.USERPROFILE || '', '.cursor', 'mcp.json');
const mcp = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
const { N8N_BASE_URL, N8N_API_KEY } = mcp.mcpServers.n8n.env;

const bodyPath = path.join(__dirname, '..', '.n8n_put_chatbot_body.json');
const body = JSON.parse(fs.readFileSync(bodyPath, 'utf8'));

const url = `${N8N_BASE_URL.replace(/\/$/, '')}/api/v1/workflows/PNc_3uhUfWJosTQi4qWtW`;
const res = await fetch(url, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'X-N8N-API-KEY': N8N_API_KEY,
  },
  body: JSON.stringify(body),
});

const text = await res.text();
if (!res.ok) {
  console.error('HTTP', res.status);
  console.error(text.slice(0, 2000));
  process.exit(1);
}
console.log('OK', res.status, 'workflow chatbot mis à jour');
