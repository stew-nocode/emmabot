/**
 * Postgres Chat Memory (n8n ≥ 1.1) : BufferWindowMemory avec k = contextWindowLength.
 * Voir https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.memorypostgreschat/
 */
export const DEFAULT_POSTGRES_CONTEXT_WINDOW = 12;

export function applyPostgresChatMemoryWindow(workflow, contextWindowLength = DEFAULT_POSTGRES_CONTEXT_WINDOW) {
  const k = Math.max(1, Math.floor(Number(contextWindowLength) || DEFAULT_POSTGRES_CONTEXT_WINDOW));
  for (const node of workflow.nodes) {
    if (node.type !== '@n8n/n8n-nodes-langchain.memoryPostgresChat') continue;
    if (node.typeVersion < 1.1) continue;
    node.parameters = node.parameters || {};
    node.parameters.contextWindowLength = k;
  }
}
