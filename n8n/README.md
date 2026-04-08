# Optimisations workflow chatbot (n8n)

Ce dossier documente les changements à appliquer dans **n8n** (UI) et **Supabase** (SQL), en lien avec le workflow **`chatbot`** (`PNc_3uhUfWJosTQi4qWtW`).

| Fichier | Rôle |
|--------|------|
| `GUIDE_OPTIMISATION_N8N.md` | Checklist + blocs à coller (routage outil, mémoire, nœuds). |
| `system-message-fr-optimise.txt` | Prompt système **raccourci** (remplace l’ancien dans le nœud *AI Agent*). |
| `../supabase/match_documents.sql` | Mise à jour de la RPC `match_documents` (filtre `metadata`). |
| `RAG_METADATA.md` | Convention `module` / `produit` sur les chunks + n8n / SQL. |
| `../supabase/documents_metadata_gin.sql` | (Optionnel) index GIN sur `documents.metadata`. |

Après modification dans n8n : **Exporter** le workflow (JSON) et l’ajouter ici en `chatbot.workflow.json` si vous versionnez les exports (optionnel).
