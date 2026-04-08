# Emma Widget (embed)

## Intégration rapide

Copier-coller le snippet dans `EMBED_SNIPPET.html`.

### Démo locale (`index.html`) + secret N8N

1. Copier `local.config.example.js` → `local.config.js` (déjà ignoré par Git).
2. Dans `local.config.js`, remplacer le secret par **la même valeur** que dans ton nœud N8N (`X-Emma-Secret`).
3. Lancer un serveur statique à la racine du repo (ex. `npx serve` depuis `Chatbot/`) et ouvrir `/emmabot/`.

### Paramètres à configurer

- **`webhookUrl`** : URL du webhook N8N
- **`webhookHeaders["X-Emma-Secret"]`** : secret partagé (optionnel mais recommandé)
- **`sessionScope`** : `"browser"` (défaut), `"tab"`, ou `"conversation"`
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

