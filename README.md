# Emma Widget (embed)

## Intégration rapide

Copier-coller le snippet dans `EMBED_SNIPPET.html`.

### Paramètres à configurer

- **`webhookUrl`** : URL du webhook N8N
- **`webhookHeaders["X-Emma-Secret"]`** : secret partagé (optionnel mais recommandé)
- **`sessionScope`** : `"browser"` (défaut), `"tab"`, ou `"conversation"`
- **`requestTimeoutMs`** : délai max pour la requête + stream (défaut `90000` ms). Mettre `0` pour désactiver.
- **`timeoutMessage`** : texte affiché si le délai est dépassé.
- **`httpErrorMessage`** : message si réponse HTTP non OK (sinon message par défaut avec code).

Pendant l’envoi d’un message, l’input, le bouton envoyer et les **suggestions (chips)** sont **désactivés** (anti double-envoi).

## Note N8N (mémoire par session)

Dans le workflow N8N, configurer le nœud **Postgres Chat Memory** pour utiliser :

- **Key** : `{{ $json.sessionId }}`

