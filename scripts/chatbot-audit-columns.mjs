/**
 * Ajoute les colonnes audit ERP (user_id, erp_session_id, page_url)
 * et statut KB (traite, priorite) au nœud « Insert row » (Data Table),
 * si elles ne sont pas déjà présentes.
 */

const TRIGGER_NODE = 'When chat message received';

/** Valeurs par défaut à chaque nouveau log (support met traite à oui quand la KB est enrichie). */
const STATUS_COLUMNS = [
  { id: 'traite', expression: "={{ 'non' }}" },
  { id: 'priorite', expression: "={{ 'normale' }}" },
];

const AUDIT_COLUMNS = [
  {
    id: 'user_id',
    expression: `={{ $('${TRIGGER_NODE}').item.json.userId ?? '' }}`,
  },
  {
    id: 'erp_session_id',
    expression: `={{ $('${TRIGGER_NODE}').item.json.erpSessionId ?? '' }}`,
  },
  {
    id: 'page_url',
    expression: `={{ $('${TRIGGER_NODE}').item.json.pageUrl ?? '' }}`,
  },
];

function schemaEntry(colId) {
  return {
    id: colId,
    displayName: colId,
    required: false,
    defaultMatch: false,
    display: true,
    type: 'string',
    readOnly: false,
    removed: false,
  };
}

export function applyAuditColumnsToInsertRow(workflow) {
  for (const node of workflow.nodes) {
    if (node.name !== 'Insert row') continue;
    const cols = node.parameters?.columns;
    if (!cols) continue;

    const allCols = [...AUDIT_COLUMNS, ...STATUS_COLUMNS];
    for (const col of allCols) {
      if (!cols.value[col.id]) {
        cols.value[col.id] = col.expression;
      }
      const hasSchema = (cols.schema || []).some((s) => s.id === col.id);
      if (!hasSchema) {
        cols.schema = cols.schema || [];
        cols.schema.push(schemaEntry(col.id));
      }
    }
  }
}
