# Snapshots workflow n8n (versionnement Git)

## Fichier

- **`chatbot.snapshot.json`** — export du workflow **chatbot** (`PNc_3uhUfWJosTQi4qWtW`), **sans** le secret du nœud *Code* d’authentification Emma (valeur remplacée par `REDACTED_Emma_SECRET`).

## Mettre à jour après des changements dans n8n

À la racine du repo **`emmabot/`** :

```bash
node scripts/export-chatbot-workflow-snapshot.mjs
git add n8n/workflows/chatbot.snapshot.json
git commit -m "chore(n8n): snapshot workflow chatbot"
```

Prérequis : `~/.cursor/mcp.json` → `mcpServers.n8n.env` avec `N8N_BASE_URL` et `N8N_API_KEY` (comme pour `push-chatbot-workflow.mjs`).

## À ne pas faire

- Ne pas committer un export **brut** si le Code contient encore le vrai secret.
- Ne pas considérer ce JSON comme un import « one-click » vers une autre instance : les **credentials** (ids) sont ceux de l’instance source ; il faut les rebrancher dans l’UI n8n.

## Relation avec les scripts `build-*`

- **`build-n8n-chatbot-put-body.mjs`** : applique prompt, chaîne légère, mémoire, RAG, puis génère `.n8n_put_chatbot_body.json` (ignoré par Git) pour **PUT** vers n8n.
- **`export-chatbot-workflow-snapshot.mjs`** : lit l’état **réel** sur le serveur n8n pour **historique / diff** dans Git.

Les deux peuvent coexister : le snapshot reflète souvent le même graphe que le dernier push, avec une trace horodatée dans `meta.exportedAt`.
