/**
 * Sonde de version du widget Emma.
 *
 * ## Pourquoi elle existe
 *
 * Le 14/09/2026 nous avons publié la 0.8.0, qui remet la conversation à zéro après 2 h
 * d'inactivité. Le 30/09, soit SEIZE JOURS plus tard, la production servait encore
 * `0.7.5-obc2` : OBC héberge sa propre copie du widget, et nos livraisons ne l'atteignent
 * jamais toutes seules. Personne ne l'a vu, parce que rien ne regardait.
 *
 * Cette sonde regarde. Elle compare trois versions :
 *   - celle que sert OBC en production   (la seule qui compte pour l'utilisateur)
 *   - celle que nous publions            (ce qu'on croit avoir livré)
 *   - celle de ce dépôt                  (ce qu'on vient d'écrire)
 *
 * ## Usage
 *
 *   node scripts/sonde-version-widget.mjs          # lecture simple
 *   node scripts/sonde-version-widget.mjs --json   # sortie machine
 *
 * Code de retour 0 si tout concorde, 1 s'il y a divergence, 2 si une source est injoignable.
 * À brancher sur n'importe quel ordonnanceur : le code de retour suffit à déclencher l'alerte.
 *
 * Aucune dépendance, aucun secret : les deux fichiers distants sont publics.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

const SOURCES = [
  { nom: 'production OBC', url: 'https://onpointsunrise.com/Scripts/emma/emma-widget.js' },
  { nom: 'notre publication', url: 'https://widget.onnext-solution.com/emma/0.8.1/emma-widget.js' },
  // GitHub Pages est l'ancienne voie de publication. Elle ne publie que quatre fichiers et AUCUN
  // secret (cf. .github/workflows/deploy-pages.yml), ce n'est donc pas un risque de sécurité.
  // Mais tant qu'elle répond, DEUX adresses servent le widget, et une seconde source de vérité
  // est précisément le problème que ce chantier supprime. Elle doit rester éteinte.
  { nom: 'ancienne voie (doit être morte)', url: 'https://stew-nocode.github.io/emmabot/emma-widget.js', doitEtreMorte: true }
];

const MOTIF_VERSION = /EMMA_WIDGET_VERSION\s*=\s*['"]([^'"]+)['"]/;
const DELAI_MS = 15000;

/** Extrait le numéro de version d'un contenu de widget, ou null si introuvable. */
function lireVersion(contenu) {
  const trouve = MOTIF_VERSION.exec(contenu || '');
  return trouve ? trouve[1] : null;
}

async function versionDistante({ nom, url }) {
  const stop = AbortSignal.timeout(DELAI_MS);
  try {
    // `cache: no-store` : sans lui, un intermédiaire pourrait nous rendre une version périmée
    // et la sonde annoncerait un faux calme.
    const reponse = await fetch(url, { cache: 'no-store', signal: stop });
    if (!reponse.ok) return { nom, url, erreur: `HTTP ${reponse.status}` };
    const version = lireVersion(await reponse.text());
    return version ? { nom, url, version } : { nom, url, erreur: 'version introuvable dans le fichier' };
  } catch (e) {
    return { nom, url, erreur: e?.name === 'TimeoutError' ? `pas de réponse en ${DELAI_MS / 1000} s` : String(e?.message || e) };
  }
}

async function versionLocale() {
  try {
    const version = lireVersion(await readFile(join(RACINE, 'emma-widget.js'), 'utf8'));
    return version ? { nom: 'ce dépôt', version } : { nom: 'ce dépôt', erreur: 'version introuvable' };
  } catch (e) {
    return { nom: 'ce dépôt', erreur: String(e?.message || e) };
  }
}

const resultats = [...(await Promise.all(SOURCES.map(versionDistante))), await versionLocale()];

// Une source marquée `doitEtreMorte` qui répond est une alerte, pas une information : on la sort
// de la comparaison de versions et on la signale à part.
const ressuscitee = resultats.find((r) => SOURCES.find((s) => s.url === r.url)?.doitEtreMorte && r.version);
const aComparer = resultats.filter((r) => !SOURCES.find((s) => s.url === r.url)?.doitEtreMorte);

const enErreur = aComparer.filter((r) => r.erreur);
const versions = new Set(aComparer.filter((r) => r.version).map((r) => r.version));
const diverge = versions.size > 1;

const prod = resultats.find((r) => r.nom === 'production OBC');
const nous = resultats.find((r) => r.nom === 'notre publication');

const verdict = ressuscitee ? 'ANCIENNE VOIE RÉACTIVÉE' : enErreur.length ? 'INJOIGNABLE' : diverge ? 'DIVERGENCE' : 'CONCORDE';
const code = ressuscitee || diverge ? 1 : enErreur.length ? 2 : 0;

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ verdict, code, resultats, mesureLe: new Date().toISOString() }, null, 2));
} else {
  console.log('Sonde de version du widget Emma — ' + new Date().toLocaleString('fr-FR'));
  console.log('');
  for (const r of resultats) {
    console.log(`  ${r.nom.padEnd(20)} ${r.version ? r.version : 'ÉCHEC : ' + r.erreur}`);
  }
  console.log('');
  console.log(`  VERDICT : ${verdict}`);
  if (ressuscitee) {
    console.log('');
    console.log('  Deux adresses servent le widget : laquelle fait foi ?');
    console.log('  Ce n\'est pas un risque de sécurité (Pages ne publie que 4 fichiers, sans');
    console.log('  secret), mais une seconde source de vérité est le problème qu\'on supprime.');
    console.log('  À éteindre : retirer .github/workflows/deploy-pages.yml, puis');
    console.log('  Settings → Pages → Source : None.');
  }
  if (diverge && prod?.version && nous?.version) {
    console.log('');
    console.log(`  La production sert ${prod.version}, nous publions ${nous.version}.`);
    console.log('  Nos correctifs ne parviennent pas aux utilisateurs. Voir');
    console.log('  docs/chantiers/dev-onnext/plan-widget-emma-source-unique-20261001.md (dépôt OnpointDoc).');
  }
}

process.exit(code);
