# Guide d’optimisation — chatbot n8n (perf + intuitivité)

Workflow cible : **chatbot** (trigger *When chat message received*, agent + Supabase Vector Store, mémoire Postgres).

## 1. Supabase — `match_documents`

1. Ouvrir **SQL Editor** (ou MCP Supabase) et exécuter le script  
   `supabase/match_documents.sql` à la racine de ce repo.
2. Vérifier que le nœud **Supabase Vector Store** envoie bien un `filter` JSON si vous segmentez par `metadata` (sinon `{}` = comportement inchangé).

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

- Dans **Postgres Chat Memory** (n8n ≥ 1.1), renseigner **Context Window Length** (`contextWindowLength` dans l’export JSON) : c’est la fenêtre **BufferWindow** (échanges récents envoyés au modèle). Le script de build impose par défaut **8** (ajustable avec `--memory-window N`).
- Plus la valeur est basse, plus les longues conversations restent rapides et légères en tokens ; si le bot perd le fil du sujet, monter vers **12–16** (voire **20** si besoin).
- Conserver `sessionKey` = `{{ $json.sessionId }}` (aligné widget).

## 7. Chaîne n8n — chemin critique

- Éviter d’enchaîner **Sheets / HTTP / Data Table lourds** avant la fin du stream côté chat ; les logs sont OK **après** le nœud qui renvoie `output` au trigger (ou en sous-workflow déclenché après coup).
- Fusionner les nœuds **Code / Set** qui ne font que recopier `output` : l’**AI Agent** expose déjà `output` → enchaîner directement **AI Agent → If** (conditions sur `{{ $json.output }}`), puis branche escalade **output → Insert row** (Data Table), branche normale **output1** seul.
- Automatisation : exporter le workflow (GET API), puis depuis `emmabot/` :
  - Prompt + chaîne légère + mémoire : `node scripts/build-n8n-chatbot-put-body.mjs chemin/workflow.json --light-chain` puis `node scripts/push-chatbot-workflow.mjs` (optionnel : `--memory-window 12`)
  - Chaîne seule (sans réécrire le prompt du script) : `node scripts/apply-chatbot-light-chain.mjs chemin/workflow.json` puis `node scripts/push-chatbot-workflow.mjs`.

## 8. Timeouts

- Définir des timeouts raisonnables sur les appels **Azure** / **Supabase** pour éviter les exécutions bloquées.

---

Après validation en staging : merger la branche Git et **documenter** la date d’application dans n8n (notes du workflow).
