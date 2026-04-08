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

- Nœud **Supabase Vector Store** (mode *Retrieve Documents as Tool*) : options **Metadata Filter** avec `$fromAI` sur `module` et `produit` (généré par `scripts/build-n8n-chatbot-put-body.mjs` par défaut).
- Le prompt système rappelle à l’agent de **ne remplir les filtres que si c’est clair** ; sinon chaînes vides → pas de contrainte côté SQL (voir `supabase/match_documents.sql`).

## Côté SQL

- La RPC `match_documents` applique `metadata @>` sur le filtre **nettoyé** (clés à valeur vide ou null supprimées).
- Après enrichissement des données, envisager un index GIN sur `metadata` si le volume augmente :  
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS documents_metadata_gin ON public.documents USING gin (metadata jsonb_path_ops);`  
  (à exécuter manuellement hors pic si besoin.)
