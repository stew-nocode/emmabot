/**
 * Configure le nœud Supabase Vector Store (retrieve-as-tool) pour des filtres metadata
 * pilotés par l’agent via $fromAI (voir n8n RAG / ai-utilities createToolFromNode).
 * Clés attendues côté documents : module, produit (jsonb @> dans match_documents).
 */
export const RAG_TOOL_DESCRIPTION = `Retrieve OBC ERP procedures and features from the knowledge base. Use for business questions about OBC (screens, steps, modules). Optional: when the user clearly scopes the question, the tool accepts rag_module (RH, Opérations, Finance, Projet, Paiement, CRM, Global) and/or rag_produit (OBC, SNI, Credit Factory); leave empty if unsure or cross-cutting. Do not call for standalone greetings; when in doubt, call with empty filters.`;

export function applyVectorStoreRagMetadataFilters(workflow) {
  for (const node of workflow.nodes) {
    if (node.name !== 'Supabase Vector Store') continue;
    if (node.parameters?.mode !== 'retrieve-as-tool') continue;
    const prev = node.parameters.options || {};
    node.parameters.options = {
      ...prev,
      queryName: prev.queryName || 'match_documents',
      metadata: {
        metadataValues: [
          {
            name: 'module',
            value:
              "={{ $fromAI('rag_module', 'OBC module code only if clearly one module: RH, Opérations, Finance, Projet, Paiement, CRM, Global. Empty string if unknown or cross-module.', 'string') }}",
          },
          {
            name: 'produit',
            value:
              "={{ $fromAI('rag_produit', 'Product line only if explicit: OBC, SNI, Credit Factory. Empty string if unknown.', 'string') }}",
          },
        ],
      },
    };
  }
}
