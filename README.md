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

