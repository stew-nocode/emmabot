/**
 * Emma — chargeur de version (loader).
 *
 * ## Pourquoi ce fichier existe
 *
 * Le 14/09/2026 nous avons publié la 0.8.0. Le 30/09, la production d'OBC servait encore
 * `0.7.5-obc2` : chaque correctif devait passer par un ticket et un déploiement chez eux, et
 * celui-là a attendu SEIZE JOURS. Une adresse figée par version (`/emma/0.8.1/emma-widget.js`)
 * supprime le fork, mais pas ce délai : elle demande encore une retouche chez l'intégrateur à
 * chaque livraison.
 *
 * Avec ce fichier, l'intégrateur pose UNE ligne, une fois :
 *
 *     <script src="https://widget.onnext-solution.com/emma/loader.js"></script>
 *
 * et c'est nous qui décidons ensuite quelle version tourne, en republiant `versions.json`.
 *
 * ## Les trois pièges, et comment ils sont traités
 *
 * 1. **Le chargement est asynchrone.** Quand l'hôte appelle `EmmaChat.init({…})` juste après la
 *    balise, `emma-widget.js` n'est pas encore là. On installe donc un TALON qui met les appels
 *    en FILE, et le widget les rejoue à son arrivée (c'est le patron d'Intercom et de Segment).
 *    Le widget 0.8.2 reconnaît ce talon à son marqueur `_talon` — sa garde « déjà chargé » le
 *    prendrait sinon pour un widget installé et renoncerait, éteignant le chat pour de bon.
 *
 * 2. **Une panne de notre côté ne doit pas éteindre le chat de 82 clients.** Si `versions.json`
 *    est injoignable, lent ou illisible, on charge `VERSION_DE_REPLI`, écrite en dur ci-dessous
 *    et remplacée à chaque publication par `scripts/preparer-publication.mjs` (elle ne peut donc
 *    pas vieillir en silence).
 *
 * 3. **`versions.json` sert à fabriquer une URL de script.** Le contenu est contrôlé par nous,
 *    mais un format strict coûte une ligne : tout ce qui n'est pas un numéro de version plausible
 *    est refusé, et on bascule sur le repli.
 *
 * Ce fichier est le SEUL du dossier `/emma/` qui soit mutable, et son cache est court (cf.
 * `vercel.json`). Les widgets eux-mêmes restent immuables, une adresse par version.
 */
(function (global, document) {
  'use strict';

  /** Remplacée à la publication par la version réellement mise en ligne. */
  var VERSION_DE_REPLI = '@@VERSION_DE_REPLI@@';

  /** Au-delà, on n'attend plus le manifeste et on charge le repli. */
  var DELAI_MANIFESTE_MS = 4000;

  /** Un numéro de version, et rien d'autre : pas de `/`, pas de `..`, pas de protocole. */
  var FORMAT_VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.]+)?$/;

  // ── Où sommes-nous publiés ? ────────────────────────────────────────────────────────────────
  // Déduit de notre propre balise, pour qu'une copie auto-hébergée fonctionne sans retouche.
  // `document.currentScript` est fiable ici : nous sommes à l'exécution synchrone du fichier.
  function basePublication() {
    var src = '';
    try {
      if (document.currentScript && document.currentScript.src) src = document.currentScript.src;
      if (!src) {
        var scripts = document.getElementsByTagName('script');
        for (var i = scripts.length - 1; i >= 0; i--) {
          var cand = scripts[i].src || '';
          if (/\/emma\/loader\.js(?:[?#]|$)/i.test(cand)) { src = cand; break; }
        }
      }
      if (src) return src.replace(/[^/]*(?:[?#].*)?$/, '');
    } catch (_) {}
    return 'https://widget.onnext-solution.com/emma/';
  }

  var BASE = basePublication();

  // ── Le talon : il encaisse les appels passés avant l'arrivée du widget ──────────────────────
  // Si un VRAI widget est déjà en place (fork hébergé par l'ERP, double intégration), on ne
  // touche à rien : le premier arrivé garde la main, comme aujourd'hui.
  if (global.EmmaChat && global.EmmaChat._talon !== true) return;

  if (!global.EmmaChat) {
    var enfiler = function (methode) {
      return function (argument) {
        this._file.push([methode, argument]);
        return this;
      };
    };
    global.EmmaChat = {
      _talon: true,
      _file: [],
      // VERSION reste absente jusqu'au chargement : nous ne la connaissons pas encore, et
      // annoncer un numéro deviné ferait mentir toute sonde qui la lit.
      init: enfiler('init'),
      open: enfiler('open'),
      close: enfiler('close'),
      toggle: enfiler('toggle'),
      newConversation: enfiler('newConversation')
    };
  }

  // ── Injection du widget ────────────────────────────────────────────────────────────────────
  var dejaInjecte = false;

  function injecter(version, estLeRepli) {
    if (dejaInjecte) return;
    dejaInjecte = true;

    var balise = document.createElement('script');
    balise.src = BASE + version + '/emma-widget.js';
    balise.async = true;
    balise.setAttribute('data-emma-version', version);

    balise.onerror = function () {
      // Le fichier annoncé par le manifeste n'existe pas (publication incomplète, faute de
      // frappe) : on retente une fois avec le repli plutôt que de laisser le chat éteint.
      if (estLeRepli || version === VERSION_DE_REPLI) {
        try { console.error('[Emma] widget introuvable : ' + balise.src); } catch (_) {}
        return;
      }
      dejaInjecte = false;
      injecter(VERSION_DE_REPLI, true);
    };

    (document.head || document.documentElement).appendChild(balise);
  }

  // ── Lecture du manifeste ───────────────────────────────────────────────────────────────────
  function versionDuManifeste(donnees) {
    var v = donnees && typeof donnees.courante === 'string' ? donnees.courante.trim() : '';
    return FORMAT_VERSION.test(v) ? v : '';
  }

  if (typeof global.fetch !== 'function') {
    injecter(VERSION_DE_REPLI, true);
    return;
  }

  // Un garde-temps explicite : `AbortSignal.timeout` n'existe pas partout, et une requête qui
  // traîne laisserait le chat absent sans jamais échouer.
  var tranche = false;
  var minuteur = global.setTimeout(function () {
    tranche = true;
    injecter(VERSION_DE_REPLI, true);
  }, DELAI_MANIFESTE_MS);

  global
    .fetch(BASE + 'versions.json', { cache: 'no-cache', credentials: 'omit' })
    .then(function (reponse) {
      if (!reponse.ok) throw new Error('HTTP ' + reponse.status);
      return reponse.json();
    })
    .then(function (donnees) {
      if (tranche) return;
      global.clearTimeout(minuteur);
      var version = versionDuManifeste(donnees);
      if (!version) {
        try { console.warn('[Emma] versions.json illisible, repli sur ' + VERSION_DE_REPLI); } catch (_) {}
        injecter(VERSION_DE_REPLI, true);
        return;
      }
      injecter(version, false);
    })
    .catch(function (e) {
      if (tranche) return;
      global.clearTimeout(minuteur);
      try { console.warn('[Emma] versions.json injoignable (' + (e && e.message ? e.message : e) + '), repli sur ' + VERSION_DE_REPLI); } catch (_) {}
      injecter(VERSION_DE_REPLI, true);
    });
})(window, document);
