import fs from 'fs';
import path from 'path';

/**
 * Lit N8N_BASE_URL et N8N_API_KEY depuis ~/.cursor/mcp.json (serveur n8n).
 */
export function loadN8nMcpEnv() {
  const mcpPath = path.join(process.env.USERPROFILE || '', '.cursor', 'mcp.json');
  if (!fs.existsSync(mcpPath)) {
    throw new Error(`Fichier MCP introuvable : ${mcpPath}`);
  }
  const mcp = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
  const env = mcp.mcpServers?.n8n?.env;
  if (!env?.N8N_BASE_URL || !env?.N8N_API_KEY) {
    throw new Error('mcp.json : mcpServers.n8n.env doit définir N8N_BASE_URL et N8N_API_KEY');
  }
  return env;
}
