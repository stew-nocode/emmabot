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

- Vérifier la **fenêtre** (nombre de messages) si le nœud l’expose : limiter évite des prompts énormes (latence).
- Conserver `sessionKey` = `{{ $json.sessionId }}` (aligné widget).

## 7. Chaîne n8n — chemin critique

- Éviter d’enchaîner **Sheets / HTTP / Data Table lourds** avant le premier octet streamé vers le chat ; déplacer les logs **après** la réponse utilisateur ou vers un sous-workflow asynchrone si possible.
- Fusionner les nœuds **Code / Set** redondants qui ne font que recopier `output`.

## 8. Timeouts

- Définir des timeouts raisonnables sur les appels **Azure** / **Supabase** pour éviter les exécutions bloquées.

---

Après validation en staging : merger la branche Git et **documenter** la date d’application dans n8n (notes du workflow).
