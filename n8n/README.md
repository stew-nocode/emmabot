# Optimisations workflow chatbot (n8n)

Ce dossier documente les changements à appliquer dans **n8n** (UI) et **Supabase** (SQL), en lien avec le workflow **`chatbot`** (`PNc_3uhUfWJosTQi4qWtW`).

| Fichier | Rôle |
|--------|------|
| `GUIDE_OPTIMISATION_N8N.md` | Checklist + blocs à coller (routage outil, mémoire, nœuds). |
| `system-message-fr-optimise.txt` | Prompt système **raccourci** (remplace l’ancien dans le nœud *AI Agent*). |
| `../supabase/match_documents.sql` | Mise à jour de la RPC `match_documents` (filtre `metadata`). |
| `RAG_METADATA.md` | Convention `module` / `produit` sur les chunks + n8n / SQL. |
| `RAG_EVAL_GRID.md` | Baseline (volume, index, `metadata`) + grille de questions à noter OK/KO. |
| `../supabase/documents_metadata_gin.sql` | (Optionnel) index GIN sur `documents.metadata`. |
| `workflows/chatbot.snapshot.json` | Export versionné (secrets Code masqués) — voir `workflows/README.md`. |
| `../scripts/export-chatbot-workflow-snapshot.mjs` | Régénère le snapshot depuis l’API n8n. |

Après changements majeurs dans n8n : lancer **`node scripts/export-chatbot-workflow-snapshot.mjs`** puis commit du JSON.

**Build** : filtres RAG metadata = **`--rag-metadata-filters`** (opt-in). Par défaut le script **retire** les metadata filters du nœud Supabase pour éviter 0 résultat tant que les chunks ne sont pas étiquetés.

**Widget ≥ 0.3.7** : le corps JSON peut contenir **`emmaUserId`** (optionnel) si l’ERP passe `userId` au `init`. Le trigger n8n peut l’ignorer ou l’utiliser pour logs / traçabilité ; la **mémoire Postgres** reste indexée sur **`sessionId`**.
