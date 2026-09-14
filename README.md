# Emma Widget (embed)

## Intégration rapide

Copier-coller le snippet dans `EMBED_SNIPPET.html`.

### Démo locale (`index.html`) + secret N8N

1. Copier `local.config.example.js` → `local.config.js` (déjà ignoré par Git).
2. Dans `local.config.js`, remplacer le secret par **la même valeur** que dans ton nœud N8N (`X-Emma-Secret`).
3. Lancer un serveur statique à la racine du repo (ex. `npx serve` depuis `Chatbot/`) et ouvrir `/emmabot/`.

### Paramètres à configurer

- **`webhookUrl`** : URL du webhook N8N
- **`webhookHeaders["X-Emma-Secret"]`** : secret partagé (optionnel mais recommandé). Le widget envoie aussi la même valeur dans le corps JSON sous **`emmaSecret`** (nécessaire si le trigger Chat N8N n’expose pas les en-têtes HTTP dans `$json`).
- **`sharedSecret`** : alternative au header — même effet sur `emmaSecret` dans le corps (prioritaire sur le header si les deux sont définis).
- **`sessionScope`** : `"browser"` (défaut), `"tab"`, ou `"conversation"`
- **`userId`** (optionnel) : identifiant stable de l’utilisateur connecté dans l’ERP. Sans ce champ, le comportement reste **identique** à avant (UUID + `localStorage` global) — adapté aux démos et tests. Avec `userId`, le widget utilise une **clé de stockage par utilisateur** (une conversation persistante par compte sur ce navigateur) et ajoute **`userId`** dans le corps JSON envoyé à n8n (en plus de `sessionId`). Si vous définissez **`sessionId`** explicitement, il reste prioritaire pour la mémoire chat ; `userId` est quand même envoyé si défini.
- **`erpSessionId`** (optionnel) : identifiant de **session de connexion** applicative (ERP). Envoyé dans le JSON sous **`erpSessionId`** pour logs / Data Table n8n (à mapper côté workflow).
- **`pageUrl`** (optionnel) : URL ou chemin de l’écran au moment de l’`init`. Pour une **SPA** dont l’URL change sans recharger la page, préférer **`getPageUrl`** : fonction sans argument, appelée **à chaque message** ; sa valeur (si non vide) remplace `pageUrl` pour le champ **`pageUrl`** du JSON.
- **`getErpSessionId`** (optionnel) : comme `getPageUrl`, pour une session ERP qui peut être rafraîchie sans réexécuter `init`.
- **`requestTimeoutMs`** : délai max pour la requête + stream (défaut `90000` ms). Mettre `0` pour désactiver.
- **`timeoutMessage`** : texte affiché si le délai est dépassé.
- **`httpErrorMessage`** : message si réponse HTTP non OK (sinon message par défaut avec code).

Pendant l’envoi d’un message, l’input, le bouton envoyer et les **suggestions (chips)** sont **désactivés** (anti double-envoi).

- **`EmmaChat.VERSION`** : version du script (debug / support).
- **`onError`** : callback optionnel `(info) => { … }` avec `info.kind` parmi `http` | `timeout` | `parse` | `network`, plus `version`, `status` (HTTP), `message`, `name`.

Si N8N renvoie un JSON du type `{ "type": "error", "content": "Unauthorized" }` (souvent **header `X-Emma-Secret` manquant**), le widget affiche désormais le texte de **`content`**.

## Note N8N (mémoire par session)

Dans le workflow N8N, configurer le nœud **Postgres Chat Memory** pour utiliser :

- **Key** : `{{ $json.sessionId }}`

### Vérification du secret (trigger « When chat message received »)

Les en-têtes HTTP ne sont en général **pas** disponibles dans `$json.headers` avec ce trigger. Dans ton nœud **Code**, accepte aussi le corps :

- `const got = ($json.headers?.['x-emma-secret'] || $json.headers?.['X-Emma-Secret'] || $json.emmaSecret);`
- Compare `got` à la valeur attendue comme avant.

## Publication GitHub Pages (widget uniquement)

Le workflow `.github/workflows/deploy-pages.yml` publie à chaque push sur `main` : `emma-widget.js`, `emma-avatar.png`, `EMBED_SNIPPET.html` et ce README. OBC charge le widget depuis `https://stew-nocode.github.io/emmabot/emma-widget.js`.

**Aucun secret n'est publié.** Jusqu'au 14/09/2026, le site publiait aussi la page de test `index.html` et un `local.config.js` généré depuis le secret GitHub `EMMA_SECRET` : le secret en service du chat était lisible par tous. La page de test se lance désormais uniquement en local (voir « Démo locale » plus haut) et le workflow n'utilise plus `EMMA_SECRET`.

**Limite importante** : un widget navigateur ne peut pas garder de secret. Celui qu'OBC transmet reste lisible dans les outils de développement de chaque utilisateur. La protection du chat se fait côté n8n (validation, limitation du nombre de messages), ou plus tard par un proxy serveur côté OBC.

### Aligner les questions rapides (chips) avec le RAG

Si une intégration reprend les **suggestions** de `index.html`, les textes doivent être **strictement les mêmes** (y compris l'**espace avant `?`**). Une petite différence peut changer l'embedding et, selon les chunks, n'affecter qu'une question (ex. bon de commande).
