/**
 * Filtre settings workflow pour PUT /api/v1/workflows/:id (schéma strict).
 */
const N8N_PUT_SETTINGS_KEYS = new Set([
  'executionOrder',
  'saveExecutionProgress',
  'saveManualExecutions',
  'saveDataErrorExecution',
  'saveDataSuccessExecution',
  'executionTimeout',
  'errorWorkflow',
  'timezone',
]);

export function pickPutSettings(src) {
  const s = src && typeof src === 'object' ? src : {};
  const out = {};
  for (const key of N8N_PUT_SETTINGS_KEYS) {
    if (s[key] !== undefined) out[key] = s[key];
  }
  if (out.executionOrder === undefined) out.executionOrder = 'v1';
  return out;
}
