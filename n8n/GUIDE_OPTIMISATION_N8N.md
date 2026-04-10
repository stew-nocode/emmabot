# Guide d’optimisation — chatbot n8n (perf + intuitivité)

Workflow cible : **chatbot** (trigger *When chat message received*, agent + Supabase Vector Store, mémoire Postgres).

## 1. Supabase — `match_documents` + métadonnées RAG

1. Exécuter `supabase/match_documents.sql` (filtre `metadata` avec `@>`, ignore les clés vides).
2. Enrichir les chunks : voir **`n8n/RAG_METADATA.md`** (clés `module`, `produit`, ingestion).
3. Filtres `$fromAI` sur **module** / **produit** : **opt-in** avec `--rag-metadata-filters` (désactivés par défaut : sans metadata complète sur les chunks, la recherche renvoie 0 ligne).
4. (Optionnel) Index GIN : `supabase/documents_metadata_gin.sql`.

## 2. Routage outil — réduire les appels RAG inutiles

Dans le nœud **AI Agent**, **ajouter en tête du message système** (ou juste après votre identité) le bloc suivant :

```
## Quand NE PAS appeler l’outil de recherche vectorielle
- Salutations ou politesses seules (« bonjour », « merci », « ok »).
- Questions sur vos capacités générales (« que peux-tu faire ? ») sans demande sur une fonctionnalité OBC précise.
- Clarifications très courtes qui ne nécessitent pas une procédure (réponse en 1 phrase depuis le fil de conversation).

## Quand appeler l’outil (obligatoire)
- Toute question sur une fonctionnalité, un écran, une procédure ou un module OBC.
- Dès que l’utilisateur décrit un cas d’usage métier (paie, stock, RH, etc.).

En cas de doute : appeler l’outil (meilleure couverture qu’un refus à tort).
```

## 3. Prompt système — version courte

- Remplacer le **gros** prompt actuel par le texte du fichier  
  `system-message-fr-optimise.txt` (même règles métier, moins de tokens = latence et coût réduits).
- Ajuster si besoin (ex. nouveaux modules) sans réintroduire de longs paragraphes redondants.

## 4. Paramètres modèle (Azure OpenAI)

- Garder **gpt-4o-mini** pour le rapport vitesse / qualité.
- **Température** : 0,3–0,5 pour des réponses procédurales plus stables (si disponible sur le nœud).

## 5. RAG — `topK`

- Par défaut **5** est correct.
- Si les réponses manquent de contexte : tester **8**.
- Si beaucoup de redondance dans les chunks : tester **3–4**.

## 6. Mémoire Postgres

- Dans **Postgres Chat Memory** (n8n ≥ 1.1), renseigner **Context Window Length** (`contextWindowLength` dans l’export JSON) : c’est la fenêtre **BufferWindow** (échanges récents envoyés au modèle). Le script de build impose par défaut **12** (ajustable avec `--memory-window N`).
- Plus la valeur est basse, plus les longues conversations restent légères en tokens ; si le bot perd le fil du sujet, monter vers **16–20** ; si la latence est un souci, tester **8–10**.
- Conserver `sessionKey` = `{{ $json.sessionId }}` (aligné widget).

## 7. Chaîne n8n — chemin critique

- Éviter d’enchaîner **Sheets / HTTP / Data Table lourds** avant la fin du stream côté chat ; les logs sont OK **après** le nœud qui renvoie `output` au trigger (ou en sous-workflow déclenché après coup).
- Fusionner les nœuds **Code / Set** qui ne font que recopier `output` : l’**AI Agent** expose déjà `output` → enchaîner directement **AI Agent → If** (conditions sur `{{ $json.output }}`), puis branche escalade **output → Insert row** (Data Table), branche normale **output1** seul.
- Automatisation : exporter le workflow (GET API), puis depuis `emmabot/` :
  - Prompt + chaîne légère + mémoire : `node scripts/build-n8n-chatbot-put-body.mjs chemin/workflow.json --light-chain` puis `node scripts/push-chatbot-workflow.mjs` (filtres RAG : ajouter `--rag-metadata-filters` seulement si les chunks ont `module`/`produit` partout)
  - Chaîne seule (sans réécrire le prompt du script) : `node scripts/apply-chatbot-light-chain.mjs chemin/workflow.json` puis `node scripts/push-chatbot-workflow.mjs`.

## 8. Timeouts

- Définir des timeouts raisonnables sur les appels **Azure** / **Supabase** pour éviter les exécutions bloquées.

## 9. Colonnes audit ERP (widget ≥ 0.3.8)

Le widget peut envoyer **`userId`**, **`erpSessionId`** et **`pageUrl`** dans le JSON (optionnels, absents par défaut pour les démos).

### Dans n8n (Data Table « logs chatbot support »)

1. **Ajouter 3 colonnes** à la Data Table (dans l'interface n8n, onglet *Data Tables*, table `logs chatbot support`) :
   - `user_id` (text)
   - `erp_session_id` (text)
   - `page_url` (text)
2. **Mapper** dans le nœud **Insert row** :
   - `user_id` ← `{{ $('When chat message received').item.json.userId ?? '' }}`
   - `erp_session_id` ← `{{ $('When chat message received').item.json.erpSessionId ?? '' }}`
   - `page_url` ← `{{ $('When chat message received').item.json.pageUrl ?? '' }}`
3. Le script **`build-n8n-chatbot-put-body.mjs`** applique ces mappings automatiquement (`applyAuditColumnsToInsertRow`).

### Résultat attendu dans la Data Table

| questions_posees | reponse_chatbot | session_id | user_id | erp_session_id | page_url |
|---|---|---|---|---|---|
| Comment calculer la paie ? | Voici la procédure… | abc-123 | user42 | erp-sess-789 | /rh/paie |

## 10. Colonnes statut KB (`traite`, `priorite`)

Pour ne pas revoir les mêmes sujets dans le **rapport hebdo** (section « À documenter »), chaque ligne de log peut être marquée comme traitée.

### Dans la Data Table « logs chatbot support »

1. **Ajouter 2 colonnes** (type **string**) si elles n’existent pas encore :
   - `traite` — valeurs usuelles : `non` (défaut), `oui` quand la KB a été enrichie ou la question classée sans action.
   - `priorite` — défaut `normale` ; optionnel : `basse`, `haute` (pour tri manuel ou future app support).

2. Le nœud **Insert row** du workflow **chatbot** renseigne à chaque nouveau log : `traite` = `non`, `priorite` = `normale` (voir snapshot + `applyAuditColumnsToInsertRow`).

3. **Traitement manuel** : dans l’interface Data Tables, passer `traite` à `oui` sur les lignes concernées.

4. **Rapport hebdomadaire** : la liste « À documenter (non traités) » ne garde que les lignes **sans réponse KB** dont `traite` n’est pas `oui`. Les lignes anciennes **sans** colonne `traite` sont considérées comme **non traitées** (rétrocompat).

---

Après validation en staging : merger la branche Git et **documenter** la date d’application dans n8n (notes du workflow).
