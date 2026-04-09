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

## Session navigateur (2026-04-09)

**Contexte** : page de démo locale `http://127.0.0.1:8765/emmabot/` (`npx serve` depuis la racine du dépôt), widget Emma branché sur le webhook n8n habituel. Vérification des **pistes prioritaires** (RH, admin/entités, Excel, connexion, faute volontaire).

| Piste | Question posée | Observation |
|--------|----------------|-------------|
| Navigation RH | « Où trouver le module RH dans OBC ? » | **Partiel / OK** : sous-modules cités (Gestion employé, Salaire, Paramétrage société), accès via menu principal → module RH ; pas de chemin menu détaillé clic à clic. |
| Admin / entités | « Comment paramétrer les entités dans le module administration ? » | **KO / Escalade** : absence d’info en base → message de transmission au support. |
| Faute « dministration » | Même intention avec « module dministration » | **Idem** : même escalade ; le problème est le **gap KB**, pas l’orthographe. |
| Export Excel | « Comment exporter un rapport en Excel dans OBC ? » | **Partiel** : pas de procédure dédiée ; renvoi à la balance comptable (analyser / exporter / imprimer selon l’ERP) + invitation à préciser le rapport. |
| Connexion ERP | « Je n’arrive pas à me connecter à OBC, que faire ? » | **OK** : mot de passe oublié, réinitialisation par admin (Administration système → Gestion des comptes utilisateurs), vérification compte / droits, puis support si besoin. |

**Synthèse** : enrichir surtout la KB sur **paramétrage des entités** (Administration) et, si besoin, **exports Excel** par contexte ; la **connexion** est déjà couverte ; le **RH** peut être affiné avec des libellés de menu plus littéraux si la doc le permet.

---

*Dernière mise à jour des chiffres : automatique via requêtes SQL ; ajuster la date si vous recalculez.*
