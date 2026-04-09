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

## Démo GitHub Pages pour les responsables (sans installation locale)

Objectif : faire tester le chat sur `https://<user>.github.io/emmabot/` **avant** intégration par les devs, sans copier `local.config.js` sur chaque poste.

1. **Secret `EMMA_SECRET` (obligatoire pour que le workflow réussisse)**  
   **Méthode recommandée** — secret au niveau du dépôt :  
   **Settings → Secrets and variables → Actions** → onglet **Secrets** → **New repository secret**  
   - Name : `EMMA_SECRET` (exactement, respecter la casse)  
   - Secret : la **même valeur** que dans N8N (`X-Emma-Secret` / `emmaSecret`).  

   **Alternative** : **Settings → Environments → `github-pages` → Environment secrets** → ajouter `EMMA_SECRET`.  
   Si le workflow affiche encore « secret absent », utilise surtout la **méthode recommandée** (Actions du dépôt).

2. **Source Pages** : **Settings → Pages** → **Build and deployment** → Source : **GitHub Actions**. Ne pas cliquer sur « Configure » pour Jekyll / Static HTML : le workflow **Deploy GitHub Pages** est déjà dans `.github/workflows/deploy-pages.yml`.

3. **Déploiement** : onglet **Actions** → **Deploy GitHub Pages** → **Run workflow** (ou push sur `main`). Après un échec, une fois le secret ajouté : **Re-run all jobs**.  
   Le site publié est construit dans un dossier `_site` (sans exposer `.github/` sur Pages). `local.config.js` n’est **pas** commité dans Git.

4. **Lien à transmettre** : `https://stew-nocode.github.io/emmabot/` (adapter si le compte ou le repo change).

### Aligner les questions rapides (chips) avec le RAG

GitHub Pages sert **`index.html`** du dépôt. Si, en local, vous testez via une page qui reprend **`EMBED_SNIPPET.html`**, les textes des **suggestions** doivent être **strictement les mêmes** (y compris l’**espace avant `?`**). Une petite différence peut changer l’embedding et, selon les chunks, n’affecter qu’une question (ex. bon de commande). Après modification de `index.html`, refaire un **push sur `main`** pour redéployer Pages.

### Si le workflow est rouge (« EMMA_SECRET absent »)

- Vérifier que le secret s’appelle bien **`EMMA_SECRET`** (pas `EMMA_SECRETS`, pas d’espace).  
- Le créer sous **Secrets and variables → Actions** (repository secret), pas seulement sous Dependabot / Codespaces.  
- Relancer le workflow.

**Limite importante** : le secret finit dans le JavaScript servi au navigateur. Toute personne qui ouvre l’URL peut le retrouver (Outils de développement). Réservez l’URL à un **usage interne** et prévoyez plus tard un **proxy serveur** côté appli pour la prod si le périmètre N8N est sensible.
