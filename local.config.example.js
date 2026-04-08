// Copier ce fichier en local.config.js puis coller le même secret que dans ton nœud N8N.
// local.config.js n’est pas versionné (voir .gitignore).
window.__EMMA_LOCAL_CONFIG = {
  webhookHeaders: {
    'X-Emma-Secret': 'COLLEZ_ICI_LE_MÊME_SECRET_QUE_DANS_N8N',
  },
};
