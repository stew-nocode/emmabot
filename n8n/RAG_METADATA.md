# RAG — métadonnées `documents.metadata`

## Clés recommandées

| Clé        | Usage | Exemples |
|-----------|--------|----------|
| `module`  | Domaine fonctionnel OBC | `RH`, `Opérations`, `Finance`, `Projet`, `Paiement`, `CRM`, `Global` |
| `produit` | Ligne produit (OnpointDoc) | `OBC`, `SNI`, `Credit Factory` |

Les valeurs doivent **correspondre exactement** à ce que le modèle peut passer dans le filtre (même casse / orthographe que dans la base).

## Ingestion des chunks

- À la **création ou mise à jour** des lignes dans `public.documents`, renseigner `metadata` en JSON, par ex.  
  `{"module":"RH","produit":"OBC","source":"manuel.pdf"}`.
- Un chunk peut avoir **un seul** `module` dominant ; si un document couvre plusieurs modules, soit plusieurs chunks avec des métadonnées différentes, soit ne pas mettre `module` (recherche large).
- Champs additionnels libres (`source`, `version`, `locale`, …) : ignorés par le filtre tant qu’ils ne sont pas dans le JSON passé à `match_documents`.

## Côté n8n

- **Sans** métadonnées fiables sur **tous** les chunks utiles : **ne pas** activer les filtres (sinon `metadata @> filter` exclut les lignes sans ces clés → **aucun** document, escalade en boucle).
- Filtres `$fromAI` : activer via **`--rag-metadata-filters`** sur `build-n8n-chatbot-put-body.mjs` (désactivés par défaut).
- Le SQL `match_documents.sql` enlève les clés vides du filtre, mais ne peut pas deviner un `module` manquant sur un chunk.

## Côté SQL

- Si `metadata` est stocké comme **chaîne jsonb** (double encodage), `metadata @> filter` ne matche pas : normaliser en objet (`(metadata #>> '{}')::jsonb`) dans la RPC ou en base — voir **`RAG_EVAL_GRID.md`** (baseline).
- La RPC `match_documents` applique `metadata @>` sur le filtre **nettoyé** (clés à valeur vide ou null supprimées).
- Après enrichissement des données, envisager un index GIN sur `metadata` si le volume augmente :  
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS documents_metadata_gin ON public.documents USING gin (metadata jsonb_path_ops);`  
  (à exécuter manuellement hors pic si besoin.)
