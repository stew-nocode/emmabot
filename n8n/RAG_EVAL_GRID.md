# Grille d’évaluation RAG — chatbot OBC

## Baseline technique (mesurée sur Supabase, projet Emma)

| Indicateur | Valeur |
|------------|--------|
| Nombre de lignes `public.documents` | **58** |
| Taille totale table | **~1376 kB** |
| Index PK | `documents_pkey` (btree sur `id`) |
| Index vectoriel | `idx_documents_embedding_ivfflat` (ivfflat, `vector_cosine_ops`, **lists = 10**) |

À **58 vecteurs**, l’IVFFlat est **largement suffisant** ; si la table passe à **plusieurs milliers** de lignes, prévoir de **reconstruire** l’index avec un `lists` plus adapté (règle courante : `sqrt(n)` en ordre de grandeur).

### Note importante sur `metadata`

Les lignes ont `jsonb_typeof(metadata) = 'string'` : le JSON objet est **stocké comme texte à l’intérieur** d’une valeur jsonb chaîne (double encodage).  
Les filtres `metadata @> {…}` en SQL **ne matchent pas** ce format tant que la colonne n’est pas **normalisée** en vrai objet jsonb (ou que `match_documents` ne fait pas `(metadata #>> '{}')::jsonb @> filter`).  
**Tant que les filtres RAG n8n sont désactivés**, la recherche utilise `filter = {}` → pas d’impact. **Avant d’activer `--rag-metadata-filters`**, normaliser les données ou adapter la RPC.

---

## Grille de tests (à remplir dans le chat)

Même session si possible (`sessionScope` inchangé). Noter : **OK** | **Partiel** | **KO** | **Escalade**.

| # | Question (copier-coller) | Résultat | Notes |
|---|---------------------------|----------|-------|
| 1 | Comment calculer la paie ? | | |
| 2 | Comment générer les états financiers ? | | |
| 3 | Comment enregistrer un bon de commande ? | | |
| 4 | Où trouver le module RH ? | | |
| 5 | Bonjour | | (ne doit pas appeler RAG inutilement) |
| 6 | Merci | | |
| 7 | Que peux-tu faire ? | | |
| 8 | Comment créer un employé ? | | |
| 9 | Comment passer une écriture comptable ? | | |
| 10 | Administration système : où paramétrer les entités ? | | |
| 11 | Comment exporter en Excel ? | | |
| 12 | Problème de connexion à l’ERP | | (hors base possible) |
| 13 | Paie du mois de mars — nouvelle paie | | |
| 14 | Compte de bilan | | |
| 15 | Cette question ne concerne pas OBC : météo demain | | (doit refuser le périmètre) |

### Après un run

- Compter **OK / Partiel / KO**.
- Si plusieurs **KO** sur le même thème : enrichir la base ou ajuster les chunks.
- Si **OK** après reformulation seulement : noter la formulation qui marche (améliorer le contenu ou les synonymes dans `content`).

### Test optionnel `topK`

Dans n8n, **Supabase Vector Store** : passer **Limit** de 5 à **8**, refaire les lignes **KO** ; noter si ça améliore sans trop allonger les réponses.

---

*Dernière mise à jour des chiffres : automatique via requêtes SQL ; ajuster la date si vous recalculez.*
